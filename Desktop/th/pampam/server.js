const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "advise22422";
const SESSION_COOKIE = "pama_admin_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, "pama-data.sqlite");

const defaultProjects = [
    {
        id: "default-estate",
        title: "Estate Development Portfolio",
        category: "Real Estate",
        caption: "Use the admin dashboard to replace this placeholder with a real estate or estate layout project image.",
        image: "",
        created_at: "2026-04-22T00:00:00.000Z"
    },
    {
        id: "default-road",
        title: "Road Infrastructure Portfolio",
        category: "Infrastructure",
        caption: "Use the admin dashboard to add a road construction photo and a matching caption for this project slot.",
        image: "",
        created_at: "2026-04-21T23:59:00.000Z"
    },
    {
        id: "default-residential",
        title: "Residential Build Portfolio",
        category: "Residential",
        caption: "Upload a residential build, frontage, or finishing image here and update the caption to match the work shown.",
        image: "",
        created_at: "2026-04-21T23:58:00.000Z"
    }
];

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon"
};

const database = new DatabaseSync(DB_PATH);

initializeDatabase();

const server = http.createServer(async (request, response) => {
    try {
        const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);
        const pathname = decodeURIComponent(requestUrl.pathname);

        if (pathname.startsWith("/api/")) {
            await handleApiRequest(request, response, requestUrl);
            return;
        }

        if (pathname === "/dashboard.html" && !isAuthenticated(request)) {
            redirect(response, "/admin-login.html");
            return;
        }

        if (pathname === "/admin-login.html" && isAuthenticated(request)) {
            redirect(response, "/dashboard.html");
            return;
        }

        serveStaticFile(response, pathname);
    } catch (error) {
        sendJson(response, 500, { error: "Internal server error." });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`PAMA site running at http://${HOST}:${PORT}`);
    if (ADMIN_PASSWORD === "advise22422") {
        console.log("Warning: ADMIN_PASSWORD is using the default value. Set a secure ADMIN_PASSWORD before production use.");
    }
});

function initializeDatabase() {
    database.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            caption TEXT NOT NULL,
            image TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS submissions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            project_type TEXT NOT NULL,
            location TEXT NOT NULL,
            timeline TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash TEXT PRIMARY KEY,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
    `);

    const countRow = database.prepare("SELECT COUNT(*) AS count FROM projects").get();
    if (!countRow || Number(countRow.count) === 0) {
        const insertProject = database.prepare(`
            INSERT INTO projects (id, title, category, caption, image, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const project of defaultProjects) {
            insertProject.run(project.id, project.title, project.category, project.caption, project.image, project.created_at);
        }
    }
}

async function handleApiRequest(request, response, requestUrl) {
    const pathname = requestUrl.pathname;

    if (request.method === "GET" && pathname === "/api/projects") {
        sendJson(response, 200, { projects: getProjects() });
        return;
    }

    if (request.method === "POST" && pathname === "/api/contact") {
        const body = await readJsonBody(request);
        handleContactSubmission(response, body);
        return;
    }

    if (request.method === "GET" && pathname === "/api/auth/session") {
        sendJson(response, 200, { authenticated: isAuthenticated(request) });
        return;
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
        const body = await readJsonBody(request);
        handleLogin(request, response, body);
        return;
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
        handleLogout(request, response);
        return;
    }

    if (!isAuthenticated(request)) {
        sendJson(response, 401, { error: "Unauthorized." });
        return;
    }

    if (request.method === "POST" && pathname === "/api/admin/projects") {
        const body = await readJsonBody(request);
        handleProjectCreate(response, body);
        return;
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/admin/projects/")) {
        const projectId = pathname.split("/").pop();
        handleProjectDelete(response, projectId);
        return;
    }

    if (request.method === "GET" && pathname === "/api/admin/submissions") {
        sendJson(response, 200, { submissions: getSubmissions() });
        return;
    }

    sendJson(response, 404, { error: "Not found." });
}

function handleContactSubmission(response, body) {
    const data = sanitizeSubmission(body);
    const validationMessage = validateSubmission(data);

    if (validationMessage) {
        sendJson(response, 400, { error: validationMessage });
        return;
    }

    const id = `submission-${Date.now()}-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    database.prepare(`
        INSERT INTO submissions (id, name, phone, project_type, location, timeline, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.phone, data.projectType, data.location, data.timeline, data.message, createdAt);

    sendJson(response, 201, { success: true });
}

function handleProjectCreate(response, body) {
    const data = sanitizeProject(body);
    const validationMessage = validateProject(data);

    if (validationMessage) {
        sendJson(response, 400, { error: validationMessage });
        return;
    }

    const project = {
        id: `project-${Date.now()}-${crypto.randomUUID()}`,
        title: data.title,
        category: data.category,
        caption: data.caption,
        image: data.image,
        created_at: new Date().toISOString()
    };

    database.prepare(`
        INSERT INTO projects (id, title, category, caption, image, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(project.id, project.title, project.category, project.caption, project.image, project.created_at);

    sendJson(response, 201, { success: true, project });
}

function handleProjectDelete(response, projectId) {
    if (!projectId) {
        sendJson(response, 400, { error: "Project id is required." });
        return;
    }

    const result = database.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    if (!result.changes) {
        sendJson(response, 404, { error: "Project not found." });
        return;
    }

    if (getProjects().length === 0) {
        const insertProject = database.prepare(`
            INSERT INTO projects (id, title, category, caption, image, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const project of defaultProjects) {
            insertProject.run(project.id, project.title, project.category, project.caption, project.image, project.created_at);
        }
    }

    sendJson(response, 200, { success: true });
}

function handleLogin(request, response, body) {
    const password = typeof body?.password === "string" ? body.password : "";

    if (!password || password !== ADMIN_PASSWORD) {
        sendJson(response, 401, { error: "Invalid admin password." });
        return;
    }

    cleanupExpiredSessions();

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION_MS;

    database.prepare(`
        INSERT INTO admin_sessions (token_hash, expires_at, created_at)
        VALUES (?, ?, ?)
    `).run(tokenHash, expiresAt, now);

    setCookie(response, SESSION_COOKIE, token, {
        httpOnly: true,
        maxAge: SESSION_DURATION_MS / 1000,
        path: "/",
        sameSite: "Strict"
    });

    sendJson(response, 200, { success: true });
}

function handleLogout(request, response) {
    const cookies = parseCookies(request.headers.cookie || "");
    const token = cookies[SESSION_COOKIE];

    if (token) {
        database.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(hashToken(token));
    }

    setCookie(response, SESSION_COOKIE, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "Strict"
    });

    sendJson(response, 200, { success: true });
}

function isAuthenticated(request) {
    cleanupExpiredSessions();

    const cookies = parseCookies(request.headers.cookie || "");
    const token = cookies[SESSION_COOKIE];

    if (!token) {
        return false;
    }

    const session = database.prepare(`
        SELECT token_hash
        FROM admin_sessions
        WHERE token_hash = ? AND expires_at > ?
    `).get(hashToken(token), Date.now());

    return Boolean(session);
}

function cleanupExpiredSessions() {
    database.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(Date.now());
}

function getProjects() {
    return database.prepare(`
        SELECT id, title, category, caption, image, created_at
        FROM projects
        ORDER BY datetime(created_at) DESC
    `).all();
}

function getSubmissions() {
    return database.prepare(`
        SELECT id, name, phone, project_type AS projectType, location, timeline, message, created_at AS createdAt
        FROM submissions
        ORDER BY datetime(created_at) DESC
    `).all();
}

function sanitizeSubmission(body) {
    return {
        name: cleanText(body?.name, 80),
        phone: cleanText(body?.phone, 20),
        projectType: cleanText(body?.projectType, 100),
        location: cleanText(body?.location, 100),
        timeline: cleanText(body?.timeline, 100),
        message: cleanText(body?.message, 800)
    };
}

function sanitizeProject(body) {
    return {
        title: cleanText(body?.title, 90),
        category: cleanText(body?.category, 60),
        caption: cleanText(body?.caption, 220),
        image: typeof body?.image === "string" ? body.image.trim() : ""
    };
}

function validateSubmission(data) {
    const phonePattern = /^[0-9+()\-\s]{7,20}$/;

    if (!data.name || !data.phone || !data.projectType || !data.location || !data.timeline || !data.message) {
        return "Please complete every field before continuing.";
    }

    if (!phonePattern.test(data.phone)) {
        return "Please enter a valid phone number.";
    }

    return "";
}

function validateProject(data) {
    if (!data.title || !data.category || !data.caption || !data.image) {
        return "Please complete every field and choose a project image.";
    }

    if (!data.image.startsWith("data:image/")) {
        return "Project image format is invalid.";
    }

    return "";
}

function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readJsonBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        request.on("data", (chunk) => {
            chunks.push(chunk);
        });

        request.on("end", () => {
            if (chunks.length === 0) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (error) {
                reject(error);
            }
        });

        request.on("error", reject);
    });
}

function serveStaticFile(response, pathname) {
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const safePath = path.normalize(requestedPath).replace(/^(\.\.[\\/])+/, "");
    const filePath = path.join(ROOT_DIR, safePath);

    if (!filePath.startsWith(ROOT_DIR)) {
        sendText(response, 403, "Forbidden");
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === "ENOENT") {
                sendText(response, 404, "Not Found");
                return;
            }

            sendText(response, 500, "Internal Server Error");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
            "Content-Type": mimeTypes[ext] || "application/octet-stream",
            "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
        });
        response.end(content);
    });
}

function parseCookies(cookieHeader) {
    return cookieHeader.split(";").reduce((cookies, part) => {
        const [name, ...rest] = part.trim().split("=");
        if (!name) {
            return cookies;
        }

        cookies[name] = decodeURIComponent(rest.join("=") || "");
        return cookies;
    }, {});
}

function setCookie(response, name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.httpOnly) {
        parts.push("HttpOnly");
    }

    if (options.maxAge !== undefined) {
        parts.push(`Max-Age=${options.maxAge}`);
    }

    if (options.path) {
        parts.push(`Path=${options.path}`);
    }

    if (options.sameSite) {
        parts.push(`SameSite=${options.sameSite}`);
    }

    response.setHeader("Set-Cookie", parts.join("; "));
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function redirect(response, location) {
    response.writeHead(302, { Location: location });
    response.end();
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body) {
    response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(body);
}
