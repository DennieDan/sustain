// CLD-08: the landing page, with the pricing note.
export default function Landing() {
  return (
    <main className="page">
      <h1>Architecture maps that keep up with your code</h1>
      <p>
        Sustain draws your repository as an architecture map whose boxes open the code they cite, shows which boxes your pull requests touch, and tells you when the map has
        drifted from the code. Sustain Cloud shares those maps and checks with your team.
      </p>
      <p>
        <strong>Maps, not code.</strong> The cloud stores maps and check results only; your agent and your code stay on your machine and your CI runner.{" "}
        <a href="/privacy">How uploads are checked</a>.
      </p>
      <h2>Pricing</h2>
      <p>Free during beta.</p>
      <p>
        <a className="button button--primary" href="/signin">
          Sign in with GitHub
        </a>{" "}
        <a className="button" href="/docs">
          Read the docs
        </a>{" "}
        <a className="button" href="/gallery">
          See public maps
        </a>
      </p>
    </main>
  );
}
