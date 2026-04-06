import styles from '../styles/Home.module.css'

export default function Home() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Shanvox</h1>
        <p>Built with Next.js · Auto-deployed via Jenkins</p>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <h2>Welcome</h2>
          <p>This is a sample Next.js app for your Jenkins auto-deployment pipeline.</p>
        </div>

        <div className={styles.grid}>
          <div className={styles.feature}>
            <h3>Step 1</h3>
            <p>Push code to GitHub</p>
          </div>
          <div className={styles.feature}>
            <h3>Step 2</h3>
            <p>Webhook fires to Jenkins</p>
          </div>
          <div className={styles.feature}>
            <h3>Step 3</h3>
            <p>Jenkins builds and deploys</p>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>Tanusree · Shanvox · {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
