// ─── GitHub Repository Fetcher ────────────────────────────────────────────────
//
// Fetches content from a GitHub repository via the GitHub REST API.
// Priority: OpenAPI/Swagger spec → README fallback.

const GITHUB_API = 'https://api.github.com'

// Candidate spec filenames, in priority order
const SPEC_NAMES = [
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'swagger.yaml',
  'swagger.yml',
  'swagger.json',
  'api.yaml',
  'api.yml',
  'api.json',
]

// Directories to search for specs (empty string = repo root)
const SPEC_DIRS = ['', 'docs', 'api', 'spec', 'specs', '.github']

// Limit tree size to avoid scanning gigantic monorepos
const MAX_TREE_ENTRIES = 5000

export type GithubFetchResult =
  | { type: 'openapi'; content: string; filename: string }
  | {
      type: 'readme'
      content: string
      repoName: string
      repoDescription: string | null
    }

type GithubRepoInfo = {
  name: string
  description: string | null
  default_branch: string
}

type GithubTreeEntry = {
  path: string
  type: string
}

type GithubContentsResponse = {
  content?: string
  encoding?: string
}

export async function fetchGithubRepo(params: {
  owner: string
  repo: string
  branch?: string
  token?: string
}): Promise<GithubFetchResult> {
  const { owner, repo, branch, token } = params

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MCPBuilder/1.0',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  // 1 — Fetch repo info to get the default branch
  const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers })
  if (!repoRes.ok) {
    if (repoRes.status === 404)
      throw new Error(`Repository ${owner}/${repo} not found or not accessible`)
    if (repoRes.status === 401 || repoRes.status === 403)
      throw new Error('GitHub authentication failed — verify your token or make the repo public')
    throw new Error(`GitHub API error ${repoRes.status} while fetching repo info`)
  }

  const repoData = (await repoRes.json()) as GithubRepoInfo
  const ref = branch || repoData.default_branch

  // 2 — Fetch the recursive file tree
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
    { headers },
  )
  if (!treeRes.ok)
    throw new Error(`Failed to fetch repository tree (HTTP ${treeRes.status})`)

  const treeData = (await treeRes.json()) as { tree: GithubTreeEntry[]; truncated?: boolean }
  const allPaths = new Set(
    treeData.tree
      .filter((f) => f.type === 'blob')
      .slice(0, MAX_TREE_ENTRIES)
      .map((f) => f.path),
  )

  // 3 — Look for an OpenAPI/Swagger spec
  for (const dir of SPEC_DIRS) {
    for (const name of SPEC_NAMES) {
      const path = dir ? `${dir}/${name}` : name
      if (allPaths.has(path)) {
        const content = await fetchFileContent(owner, repo, ref, path, headers)
        return { type: 'openapi', content, filename: path }
      }
    }
  }

  // 4 — Fallback: README
  const readmePath = ['README.md', 'readme.md', 'Readme.md', 'docs/README.md'].find((p) =>
    allPaths.has(p),
  )
  const readmeContent = readmePath
    ? await fetchFileContent(owner, repo, ref, readmePath, headers).catch(() => '')
    : ''

  return {
    type: 'readme',
    content: readmeContent,
    repoName: repoData.name,
    repoDescription: repoData.description,
  }
}

async function fetchFileContent(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  headers: Record<string, string>,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
    { headers },
  )
  if (!res.ok) throw new Error(`Failed to fetch ${path} (HTTP ${res.status})`)

  const data = (await res.json()) as GithubContentsResponse
  if (!data.content) throw new Error(`No content returned for ${path}`)

  // GitHub always returns base64-encoded content for file contents API
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
}
