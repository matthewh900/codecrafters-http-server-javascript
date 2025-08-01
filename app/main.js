const net = require("net");
const fs = require("fs");
const path = require("path");

const args = process.argv;
const dirIndex = args.indexOf("--directory");
let filesDirectory = ".";

if (dirIndex !== -1 && args[dirIndex + 1]) {
  filesDirectory = args[dirIndex + 1];
}

console.log("Logs from your program will appear here!");

const server = net.createServer((socket) => {
  let requestData = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    requestData = Buffer.concat([requestData, chunk]);

    const requestStr = requestData.toString();
    const headerEndIndex = requestStr.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) {
      return; // Wait for full headers
    }

    const headersPart = requestStr.slice(0, headerEndIndex);
    const bodyPart = requestData.slice(headerEndIndex + 4);

    const [requestLine, ...headerLines] = headersPart.split("\r\n");
    const [method, urlPath] = requestLine.split(" ");

    const headers = {};
    for (const line of headerLines) {
      const [key, ...rest] = line.split(":");
      if (key && rest.length > 0) {
        headers[key.trim().toLowerCase()] = rest.join(":").trim();
      }
    }

    const contentLength = headers["content-length"]
      ? parseInt(headers["content-length"], 10)
      : 0;

    if (bodyPart.length < contentLength) {
      return; // Wait for full body
    }

    const body = bodyPart.slice(0, contentLength);

    // Route: "/"
    if (urlPath === "/") {
      socket.write("HTTP/1.1 200 OK\r\n\r\n");
      socket.end();

    // Route: "/echo/{str}"
    } else if (method === "GET" && urlPath.startsWith("/echo/")) {
      const echoStr = decodeURIComponent(urlPath.slice(6));
      const responseBody = JSON.stringify(echoStr).slice(1, -1); // Remove extra quotes
      const contentLength = Buffer.byteLength(responseBody);

      const acceptEncoding = (headers["accept-encoding"] || "").toLowerCase();

      const responseHeaders = [
        "HTTP/1.1 200 OK",
        "Content-Type: text/plain",
      ];

      if (acceptEncoding.includes("gzip")) {
        responseHeaders.push("Content-Encoding: gzip");
      }

      responseHeaders.push(`Content-Length: ${contentLength}`, "", responseBody);

      const response = responseHeaders.join("\r\n");
      socket.write(response);
      socket.end();

    // Route: "/user-agent"
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
      socket.end();

    // Route: "/files/{filename}" (GET)
    } else if (method === "GET" && urlPath.startsWith("/files/")) {
      const filename = decodeURIComponent(urlPath.slice("/files/".length));
      const filePath = path.join(filesDirectory, filename);
      const resolvedBase = path.resolve(filesDirectory);
      const resolvedFile = path.resolve(filePath);

      if (!resolvedFile.startsWith(resolvedBase)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
        socket.end();
        return;
      }

      fs.readFile(resolvedFile, (err, data) => {
        if (err) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.end();
        } else {
          const headers = [
            "HTTP/1.1 200 OK",
            "Content-Type: application/octet-stream",
            `Content-Length: ${data.length}`,
            "",
            "",
          ].join("\r\n");

          socket.write(headers);
          socket.write(data);
          socket.end();
        }
      });

    // Route: "/files/{filename}" (POST)
    } else if (method === "POST" && urlPath.startsWith("/files/")) {
      const filename = decodeURIComponent(urlPath.slice("/files/".length));
      const filePath = path.join(filesDirectory, filename);
      const resolvedBase = path.resolve(filesDirectory);
      const resolvedFile = path.resolve(filePath);

      if (!resolvedFile.startsWith(resolvedBase)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
        socket.end();
        return;
      }

      fs.writeFile(resolvedFile, body, (err) => {
        if (err) {
          socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket.end();
          return;
        }

        socket.write("HTTP/1.1 201 Created\r\n\r\n");
        socket.end();
      });

    // Route not found
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
