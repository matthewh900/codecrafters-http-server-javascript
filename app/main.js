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

    // Try to parse headers first: headers end with \r\n\r\n
    const requestStr = requestData.toString();
    const headerEndIndex = requestStr.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) {
      // Headers not fully received yet — wait for more data
      return;
    }

    // Separate headers and possible partial body
    const headersPart = requestStr.slice(0, headerEndIndex);
    const bodyPart = requestData.slice(headerEndIndex + 4);

    // Parse request line and headers
    const [requestLine, ...headerLines] = headersPart.split("\r\n");
    const [method, urlPath] = requestLine.split(" ");

    // Parse headers into object
    const headers = {};
    for (const line of headerLines) {
      const [key, ...rest] = line.split(":");
      if (key && rest.length > 0) {
        headers[key.trim().toLowerCase()] = rest.join(":").trim();
      }
    }

    // For POST, we need to wait until full body received:
    const contentLength = headers["content-length"]
      ? parseInt(headers["content-length"], 10)
      : 0;

    if (bodyPart.length < contentLength) {
      // Not received full body yet; wait for more data
      return;
    }

    // Now we have full request (headers + full body)
    const body = bodyPart.slice(0, contentLength);

    // Handle routes:

    if (urlPath === "/") {
      socket.write("HTTP/1.1 200 OK\r\n\r\n");
      socket.end();

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
      socket.end();

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

      // Write the request body to the file
      fs.writeFile(resolvedFile, body, (err) => {
        if (err) {
          // Could respond with 500 but spec doesn't mention it, so:
          socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket.end();
          return;
        }

        // Success: respond with 201 Created
        socket.write("HTTP/1.1 201 Created\r\n\r\n");
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

  socket.on("close", () => {});
});

server.listen(4221, "localhost");
