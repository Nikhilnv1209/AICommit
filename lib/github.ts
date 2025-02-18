import { Octokit } from "octokit"

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

const githubUrl = "https://github.com/docker/genai-stack"

type Response = {
  commitHash         : string
  commitAuthorName   : string
  commitAuthorAvatar : string
  commitMessage      : string
  commitDate         : string
}

export const getCommitHashes = async (githubUrl: string): Promise<Response[]> => {
  const { data } = await octokit.rest.repos.listCommits({
    owner: "docker",
    repo: "genai-stack",
  })

  const sortCommits = data.sort((a: any, b: any) => {
    return new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime()
  }) as any[]

  return sortCommits.slice(0, 15).map((commit) => {
    return {
      commitHash         : commit.sha as string,
      commitAuthorName   : commit.commit?.author?.name ?? "",
      commitAuthorAvatar : commit.author?.avatar_url ?? "",
      commitMessage      : commit.commit.message ?? "",
      commitDate         : commit.commit?.author?.date ?? "",
    }
  })
}

console.log(await getCommitHashes(githubUrl))