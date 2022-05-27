import asyncRequireContext from "async-require-context";
import chalk from "chalk";
import { Application, Express, RequestHandler } from "express";
import { readFileSync } from "fs";
import { readdir, readFile } from "fs/promises";
import http from "http";
import https from "https";
import { resolve } from "path";
import { Endpoint, Middleware, Runtime } from "./types";

const { webserver } = JSON.parse(readFileSync(resolve("./package.json"), "utf8"));

export default async function server(app: Express): Promise<http.Server | https.Server> {

	// Apply all middlewares
	const middlewares = await asyncRequireContext<Middleware>("./lib/src/middleware").catch(() => []);
	middlewares.map(middleware => {
		app.use(<RequestHandler><unknown>middleware.module.default);
		console.info(chalk.magenta("MDW"), "Added middleware from", chalk.cyan(middleware.path));
	});

	// Apply all runtimes
	const runtimes = await asyncRequireContext<Runtime>("./lib/src/runtime").catch(() => []);
	runtimes.map(runtime => {
		runtime.module.default(app);
		console.info(chalk.yellow("RNT"), "Added runtime from", chalk.cyan(runtime.path));
	});

	// Get all API endpoints and add them to the app context.
	const endpoints = await asyncRequireContext<Endpoint>("./lib/api").catch(() => []);
	endpoints.map(function(endpoint) {
		const routes = typeof endpoint.module.route === "string" ? [ endpoint.module.route ] : endpoint.module.route;
		routes.map(route => app.all(`/api/${route}`, <Application><unknown>endpoint.module.default));
		routes.map(route => app.all(`/${route}`, <Application><unknown>endpoint.module.default));
		console.info(chalk.greenBright("EDP"), "Added API endpoints from", chalk.cyan(endpoint.path));
	});

	// Get port to listen on (HTTP)
	const PORT = process.env.PORT || webserver.http.port;
	const SSL_PORT = process.env.SSL_PORT || webserver.https.port;

	// Start HTTP server
	let server = http.createServer(app).listen(PORT);
	console.info(chalk.redBright("SRV"), "HTTP server running on", chalk.cyan(`:${PORT} (http)`));

	// Start HTTPS server
	if (webserver.https.enabled) {

		let files = await readdir(resolve(webserver.https.certs));
		files = files.map(file => resolve(webserver.https.certs, file));

		const key = files.filter(file => file.includes("key"))[0];
		const cert = files.filter(file => file.includes("cert"))[0];

		// Initialize HTTPS server
		server = https.createServer({
			key: await readFile(key, "utf8"),
			cert: await readFile(cert, "utf8")
		}, app).listen(SSL_PORT);
		console.info(chalk.redBright("SRV"), "SSL server running on", chalk.cyan(`:${SSL_PORT} (https)`));

	}

	return server;

}
