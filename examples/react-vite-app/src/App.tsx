import "./portfolio.css";

// Rendered by a single .map() below: four paragraphs on screen, ONE line in
// this file. froede should warn before an edit changes all four.
const aboutParagraphs = [
  "I like turning rough ideas into working products.",
  "This whole page is editable with froede - click any line of text and change it.",
  "These paragraphs all come from the same .map(), so they share one source location.",
  "Try changing the colour of just one of them and read the warning.",
];

export default function App() {
  return (
    <div className="page">
      <header className="nav">
        <span className="logo">munir.dev</span>
        <nav>
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Portfolio</p>
          <h1>I design and build things for the web</h1>
          <p className="lead">
            Frontend developer focused on clean interfaces, fast pages and small
            tools that make building easier.
          </p>
          <div className="cta">
            <a className="btn primary" href="#work">See my work</a>
            <a className="btn ghost" href="#contact">Get in touch</a>
          </div>
        </section>

        <section id="work" className="block">
          <h2>Selected work</h2>
          <div className="cards">
            <article className="card">
              <h3>froede</h3>
              <p>A tiny toolkit to edit web pages by clicking, right in the browser.</p>
            </article>
            <article className="card">
              <h3>Layco</h3>
              <p>A local, offline AI assistant that lives on your desktop.</p>
            </article>
            <article className="card">
              <h3>Open source</h3>
              <p>Small experiments and libraries shared on GitHub.</p>
            </article>
          </div>
        </section>

        <section id="about" className="block">
          <h2>About me</h2>
          {aboutParagraphs.map((text, i) => (
            <p key={i} className="lead">
              {text}
            </p>
          ))}
        </section>
      </main>

      <footer id="contact" className="foot">
        <p>Made with froede - click this text to edit it.</p>
      </footer>
    </div>
  );
}
