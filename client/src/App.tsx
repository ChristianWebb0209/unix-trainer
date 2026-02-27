import { Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Editor from "./pages/Editor"
import { useEffect } from "react"
import { pingServer } from "./api/test"

function App() {
  useEffect(() => {
    pingServer().then((res) => console.log(res)).catch(console.error)
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/editor" element={<Editor />} />
    </Routes>
  )
}

export default App