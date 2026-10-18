import { createServer } from "node:http";
import { addNote, listNotes } from "./store";

const server = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/notes") {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const note = addNote(String(JSON.parse(body).text ?? ""));
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(note));
    });
    return;
  }
  if (request.method === "GET" && request.url === "/notes") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(listNotes()));
    return;
  }
  response.writeHead(404).end();
});

server.listen(8080);
