import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;

/**
 * Flipkart E-Commerce Web Server in pure Java.
 * Standard Java built-in HttpServer (No external Maven/Gradle libraries required).
 *
 * Compilation: javac FlipkartServer.java
 * Execution:   java FlipkartServer
 */
public class FlipkartServer {
    private static final int PORT = 8080;

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/", new StaticFileHandler());
        server.setExecutor(null); // default executor
        System.out.println("==================================================");
        System.out.println(" Flipkart Server Started Successfully!");
        System.out.println(" Open in Browser: http://localhost:" + PORT);
        System.out.println("==================================================");
        server.start();
    }

    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String uriPath = exchange.getRequestURI().getPath();
            if (uriPath.equals("/") || uriPath.isEmpty()) {
                uriPath = "/index.html";
            }

            File file = new File("." + uriPath).getCanonicalFile();
            File currentDir = new File(".").getCanonicalFile();

            // Prevent path traversal
            if (!file.getPath().startsWith(currentDir.getPath()) || !file.exists() || file.isDirectory()) {
                String response = "404 (Not Found)\n";
                exchange.sendResponseHeaders(404, response.length());
                OutputStream os = exchange.getResponseBody();
                os.write(response.getBytes());
                os.close();
                return;
            }

            String contentType = Files.probeContentType(file.toPath());
            if (contentType == null) {
                if (file.getName().endsWith(".css")) {
                    contentType = "text/css; charset=UTF-8";
                } else if (file.getName().endsWith(".js")) {
                    contentType = "application/javascript; charset=UTF-8";
                } else if (file.getName().endsWith(".jpg") || file.getName().endsWith(".jpeg")) {
                    contentType = "image/jpeg";
                } else {
                    contentType = "application/octet-stream";
                }
            }

            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, file.length());

            try (FileInputStream fis = new FileInputStream(file);
                 OutputStream os = exchange.getResponseBody()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = fis.read(buffer)) > 0) {
                    os.write(buffer, 0, count);
                }
            }
        }
    }
}
