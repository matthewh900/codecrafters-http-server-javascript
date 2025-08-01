const net = require("net");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const args = process.argv;
const dirIndex = args.indexOf("--directory");
const filesDirectory = (dirIndex !== -1 && args[dirIndex + 1]) ? args[dirIndex + 1] : ".";

console.log(`Starting server, serving files from: ${filesDirectory}`);

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);

  // Called to close connection if needed based on Connection header
  const endSocketIfNeeded = (shouldClose) => {
    if (shouldClose) {
      socket.end();
    }
  };

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Try to process as many full HTTP requests as possible from the buffer
    while (true) {
      const requestString = buffer.toString();
      const headerEndIndex = requestString.indexOf("\r\n\r\n");

      // Headers incomplete, wait for more data
      if (headerEndIndex === -1) return;

      const headersPart = requestString.slice(0, headerEndIndex);
      const bodyPart = buffer.slice(headerEndIndex + 4);

      const [requestLine, ...headerLines] = headersPart.split("\r\n");
      const [method, urlPath] = requestLine.split(" ");

      // Parse headers into a lowercase-key dictionary
      const headers = {};
      for (const line of headerLines) {
        const [key, ...rest] = line.split(":");
        if (key && rest.length > 0) {
          headers[key.trim().toLowerCase()] = rest.join(":").trim();
        }
      }

      const contentLength = headers["content-length"] ? parseInt(headers["content-length"], 10) : 0;

      // Body incomplete, wait for more data
      if (bodyPart.length < contentLength) return;

      const fullRequestLength = headerEndIndex + 4 + contentLength;
      const body = bodyPart.slice(0, contentLength);

      // Connection management
      const connectionHeader = (headers["connection"] || "").toLowerCase();
      const shouldClose = connectionHeader === "close";

      // Routing logic
      if (urlPath === "/") {
        // Respond 200 OK with no body
        const headers = ["HTTP/1.1 200 OK"];
        if (shouldClose) headers.push("Connection: close");
        headers.push("", "");

        socket.write(headers.join("\r\n"));
        endSocketIfNeeded(shouldClose);

      } else if (method === "GET" && urlPath.startsWith("/echo/")) {
        const echoStr = decodeURIComponent(urlPath.slice(6));
        const acceptEncoding = (headers["accept-encoding"] || "").toLowerCase();
        const supportsGzip = acceptEncoding.includes("gzip");

        if (supportsGzip) {
          // Compress response with gzip
          zlib.gzip(echoStr, (err, compressedData) => {
            if (err) {
              console.error("Gzip compression failed:", err);
              socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
              endSocketIfNeeded(shouldClose);
              return;
            }

            const responseHeaders = [
              "HTTP/1.1 200 OK",
              "Content-Type: text/plain",
              "Content-Encoding: gzip",
              `Content-Length: ${compressedData.length}`,
            ];
            if (shouldClose) responseHeaders.push("Connection: close");
            responseHeaders.push("", "");

            socket.write(responseHeaders.join("\r\n"));
            socket.write(compressedData);
            endSocketIfNeeded(shouldClose);
          });
        } else {
          // Plain text response
          const bufferBody = Buffer.from(echoStr, "utf-8");
          const responseHeaders = [
            "HTTP/1.1 200 OK",
            "Content-Type: text/plain",
            `Content-Length: ${bufferBody.length}`,
          ];
          if (shouldClose) responseHeaders.push("Connection: close");
          responseHeaders.push("", echoStr);

          socket.write(responseHeaders.join("\r\n"));
          endSocketIfNeeded(shouldClose);
        }

      } else if (method === "GET" && urlPath === "/user-agent") {
        // Respond with User-Agent header or "Unknown"
        const userAgent = headers["user-agent"] || "Unknown";
        const length = Buffer.byteLength(userAgent);

        const responseHeaders = [
          "HTTP/1.1 200 OK",
          "Content-Type: text/plain",
          `Content-Length: ${length}`,
        ];
        if (shouldClose) responseHeaders.push("Connection: close");
        responseHeaders.push("", userAgent);

        socket.write(responseHeaders.join("\r\n"));
        endSocketIfNeeded(shouldClose);

      } else if (method === "GET" && urlPath.startsWith("/files/")) {
        // Serve file safely from filesDirectory
        const filename = decodeURIComponent(urlPath.slice("/files/".length));
        const filePath = path.join(filesDirectory, filename);

        // Prevent directory traversal
        const resolvedBase = path.resolve(filesDirectory);
        const resolvedFile = path.resolve(filePath);
        if (!resolvedFile.startsWith(resolvedBase)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
          endSocketIfNeeded(shouldClose);
          return;
        }

        fs.readFile(resolvedFile, (err, data) => {
          if (err) {
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          } else {
            const responseHeaders = [
              "HTTP/1.1 200 OK",
              "Content-Type: application/octet-stream",
              `Content-Length: ${data.length}`,
            ];
            if (shouldClose) responseHeaders.push("Connection: close");
            responseHeaders.push("", "");

            socket.write(responseHeaders.join("\r\n"));
            socket.write(data);
          }
          endSocketIfNeeded(shouldClose);
        });

      } else if (method === "POST" && urlPath.startsWith("/files/")) {
        // Save posted body to file securely
        const filename = decodeURIComponent(urlPath.slice("/files/".length));
        const filePath = path.join(filesDirectory, filename);

        const resolvedBase = path.resolve(filesDirectory);
        const resolvedFile = path.resolve(filePath);
        if (!resolvedFile.startsWith(resolvedBase)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden");
          endSocketIfNeeded(shouldClose);
          return;
        }

        fs.writeFile(resolvedFile, body, (err) => {
          if (err) {
            socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          } else {
            socket.write("HTTP/1.1 201 Created\r\n\r\n");
          }
          endSocketIfNeeded(shouldClose);
        });

      } else {
        // Fallback: 404 Not Found
        const bodyText = "Not Found";
        const responseHeaders = [
          "HTTP/1.1 404 Not Found",
          "Content-Type: text/plain",
          `Content-Length: ${Buffer.byteLength(bodyText)}`,
        ];
        if (shouldClose) responseHeaders.push("Connection: close");
        responseHeaders.push("", bodyText);

        socket.write(responseHeaders.join("\r\n"));
        endSocketIfNeeded(shouldClose);
      }

      // Remove processed request from buffer to parse next one (if any)
      buffer = buffer.slice(fullRequestLength);

      if (buffer.length === 0) return; // no more data to process
    }
  });

  socket.on("close", () => {
    // Connection closed - could add logging here if needed
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);
    socket.destroy();
  });
});

server.listen(4221, "localhost", () => {
  console.log("Server listening on localhost:4221");
});
