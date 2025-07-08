const net = require("net");
const fs = require("fs");
const path = require("path");

const args = process.argv;
const dirIndex = args.indexOf("--directory");
let filesDirectory = ".";

if (dirIndex !== -1 && args[dirIndex + 1]) {
  filesDirectory = args[dirIndex + 1];
}

const server = net.createServer((socket) => {
  socket.on("data", (buffer) => {
    const request = buffer.toString();
    const [requestLine, ...headerLines] = request.split("\r\n");
    const [method, urlPath] = requestLine.split(" ");

    if (urlPath === "/") {
      socket.write("HTTP/1.1 200 OK\r\n\r\n");
    } else if (method === "GET" && urlPath.startsWith("/files/")) {
      const filename = decodeURIComponent(urlPath.slice("/files/".length));
      const filePath = path.join(filesDirectory, filename);

      if (!filePath.startsWith(path.resolve(filesDirectory))) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
        socket.end();
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        } else {
          const headers = [
            "HTTP/1.1 200 OK",
            "Content-Type: application/octet-stream",
            `Content-Length: ${data.length}`,
            "",
          ].join("\r\n");

          socket.write(headers);
          socket.write(data);
        }
        socket.end();
      });
    } else {
      const response = [
        "HTTP/1.1 404 Not Found",
        "Content-Type: text/plain",
        "Content-Length: 9",
        "",
        "Not Found",
      ].join("\r\n");

      socket.write(response);
      socket.end();
    }
  });
});

server.listen(4221, "localhost");
