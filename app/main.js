const net = require("net");
const fs = require("fs");
const path = require("path");

// Read the --directory argument from command line
const args = process.argv;
const dirIndex = args.indexOf("--directory");
let filesDirectory = "."; // fallback

if (dirIndex !== -1 && args[dirIndex + 1]) {
  filesDirectory = args[dirIndex + 1];
}

console.log("Logs from your program will appear here!");

const server = net.createServer((socket) => {
  socket.on("data", (buffer) => {
    const request = buffer.toString();
    const [requestLine, ...headerLines] = request.split("\r\n");
    const [method, urlPath] = requestLine.split(" ");

    if (urlPath === "/") {
      socket.write("HTTP/1.1 200 OK\r\n\r\n");

    } else if (method === "GET" && urlPath.startsWith("/echo/")) {
      const echoStr = decodeURIComponent(urlPath.slice(6));
      const responseBody = JSON.stringify(echoStr).slice(1, -1);
      const contentLength = Buffer.byteLength(responseBody);

      const response = [
        "HTTP/1.1 200 OK",
        "Content-Type: text/plain",
        `Content-Length: ${contentLength}`,
        "",
        responseBody,
      ].join("\r\n");

      socket.write(response);

    } else if (method === "GET" && urlPath === "/user-agent") {
      const userAgentLine = headerLines.find((line) =>
        line.toLowerCase().startsWith("user-agent:")
      );
      let userAgent = "Unknown";

      if (userAgentLine) {
        const index = userAgentLine.indexOf(":");
        if (index !== -1) {
          userAgent = userAgentLine.slice(index + 1).trim();
        }
      }

      const contentLength = Buffer.byteLength(userAgent);

      const response = [
        "HTTP/1.1 200 OK",
        "Content-Type: text/plain",
        `Content-Length: ${contentLength}`,
        "",
        userAgent,
      ].join("\r\n");

      socket.write(response);

    } else if (method === "GET" && urlPath.startsWith("/files/")) {
      // Extract filename
      const filename = decodeURIComponent(urlPath.slice("/files/".length));

      // Resolve full path to avoid directory traversal
      const filePath = path.join(filesDirectory, filename);
      const resolvedBase = path.resolve(filesDirectory);
      const resolvedFile = path.resolve(filePath);

      // Security check: file must be inside the filesDirectory
      if (!resolvedFile.startsWith(resolvedBase)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
        socket.end();
        return;
      }

      // Read file asynchronously
      fs.readFile(resolvedFile, (err, data) => {
        if (err) {
          // File not found
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.end();
        } else {
          // Success response with file content
          const headers = [
            "HTTP/1.1 200 OK",
            "Content-Type: application/octet-stream",
            `Content-Length: ${data.length}`,
            "",
            "", // blank line to end headers
          ].join("\r\n");

          socket.write(headers);
          socket.write(data);
          socket.end();
        }
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

  socket.on("close", () => {});
});

server.listen(4221, "localhost");
