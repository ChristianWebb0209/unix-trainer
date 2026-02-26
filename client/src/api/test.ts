export async function pingServer() {
  const res = await fetch("http://localhost:3000/")
  return res.text()
}