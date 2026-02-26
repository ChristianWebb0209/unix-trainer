import { useEffect } from "react"
import { pingServer } from "./api/test"

function App() {
  useEffect(() => {
    pingServer().then(console.log)
  }, [])

  return <h1>Unix Trainer</h1>
}

export default App