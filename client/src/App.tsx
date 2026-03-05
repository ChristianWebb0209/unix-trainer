import { Routes, Route, Navigate } from "react-router-dom"
import Home from "./pages/Home"
import Editor from "./pages/Editor"
import Account from "./pages/Account"
import ChooseTechnology from "./pages/ChooseTechnology"
import { useEffect } from "react"
import { pingServer } from "./api/test"

function App() {
  useEffect(() => {
    pingServer().then((res) => console.log(res)).catch(console.error)
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/account" element={<Account />} />
      <Route path="/choose-technology" element={<ChooseTechnology />} />
      <Route path="/editor" element={<Navigate to="/editor/unix" replace />} />
      <Route path="/editor/:workspace" element={<Editor />} />
    </Routes>
  )
}

export default App