# Dogfooding Sustain

Run every command from this repository with the Node version in `.nvmrc`. Start with `source ~/.nvm/nvm.sh && nvm use` in each new terminal. [features.md](features.md) lists what there is to try.

## Use it in VS Code

```bash
npm ci
npm run package
code --install-extension sustain-0.2.0.vsix
```

Reload VS Code, open any project and click the Sustain icon in the Activity Bar. Type an optional focus and press **Generate**. The setup checklist in the sidebar names anything missing, such as an agent CLI, and offers a fix. Generating needs Claude Code, Codex or Devin installed and signed in.

Cursor installs the same file with `cursor --install-extension sustain-0.2.0.vsix`. After pulling new code, package and install again.

## Put Sustain in another project

- **From the editor.** Open the project and press Generate. Sustain installs its skills in your home folder (`~/.claude/skills`, `~/.agents/skills`) on the first run, so every project has them. Set `sustain.skillScope` to `project` to install them in the project's `.claude/skills` and `.agents/skills` instead. **Sustain: Install Agent Skills** in the Command Palette installs them without generating.
- **From a terminal.** Build once with `npm run build`, then run the following, with `--scope user` for your home folder instead. In the project, run `/sustain-architecture` in Claude Code or `$sustain-architecture` in Codex.

  ```bash
  node ~/sustain/dist/cli/sustain.mjs install --root /path/to/project --scope project
  ```

- **From GitHub.** After pull request #4 merges, `npx skills add xplus2g4/sustain` installs the skills in any project. That path still waits for its smoke check.
- **To take it out again,** run **Sustain: Remove Sustain from This Folder**.

## Test the cloud

### The automated tests

```bash
npm run -w cloud test
npm run -w cloud build
npm run -w cloud test:web
```

The unit tests take about a minute, and the browser tests take about nine minutes here.

### Click through it locally

A stand-in for GitHub signs you in as `dev` and treats every repository under `acme` as yours, so no OAuth app is needed. Start it in one terminal.

```bash
node cloud/test/web/mockGithub.mjs 3211
```

Build and start the cloud in a second terminal. The database lives in `cloud/.data/dev`, which git ignores.

```bash
npm run -w cloud build
cd cloud && SUSTAIN_DB=.data/dev NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=dev-secret-dev-secret-dev-secret GITHUB_CLIENT_ID=dev GITHUB_CLIENT_SECRET=dev GITHUB_OAUTH_URL=http://localhost:3211 GITHUB_API_URL=http://localhost:3211 SUSTAIN_OIDC_JWKS_URL=http://localhost:3211/.well-known/jwks npm run start -- -p 3000 -H 0.0.0.0
```

Open http://localhost:3000 and sign in. To put a map on it:

1. Open http://localhost:3000/settings/acme/demo and create an upload token.
2. Clone a project whose map is committed on `main`, point the clone at the stand-in repository and publish. The CLI prints warnings about `date-time`, which are harmless.

   ```bash
   git clone /path/to/project /tmp/demo && cd /tmp/demo
   git remote set-url origin https://github.com/acme/demo.git
   SUSTAIN_TOKEN=<token> node ~/sustain/dist/cli/sustain.mjs publish --url http://localhost:3000
   ```

3. Open http://localhost:3000/acme/demo to see the map.

### With your real GitHub account

Create a GitHub OAuth app whose callback URL is `http://localhost:3000/api/auth/callback/github`. Start the cloud with the command above, using the app's client ID and secret and leaving out the three `GITHUB_OAUTH_URL`, `GITHUB_API_URL` and `SUSTAIN_OIDC_JWKS_URL` settings. Sign-in and repository access then come from GitHub. `docker compose -f cloud/docker-compose.yml up --build` runs the same app in Docker, with the four settings in `cloud/.env`.
