import { app } from "./app.js";

const PORT = process.env.PORT ? process.env.PORT : 3000;

app.listen(PORT, () => {
  console.log("Server running on http://localhost:3000/");
});
