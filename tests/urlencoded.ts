import * as assert from "uvu/assert";

import { test } from "uvu";
import { Bodyguard } from "../src/index.js";
import { ERRORS } from "../src/lib.js";

test("it passes complex input (softForm with urlencoded)", async () => {
	const bodyguard = new Bodyguard();

	const req = new Request("http://localhost", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "a=1&b=2&&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb",
	});

	const result = await bodyguard.softForm(req, undefined, {
		castNumbers: true,
	});

	assert.equal(result.success, true);

	if (result.success) {
		const data = result.value as any;
		assert.equal(data.a, 1);
		assert.equal(data.b, 2);
		assert.equal(data.c.d, 3);
		assert.equal(data.c.e, "bb");
		assert.equal(data.e, "foo");
		assert.equal(data.f.g, 4);
		assert.equal(data.f.bgfd, 5);
		assert.equal(data.f.h[0], "foo bar");
	}
});

test("it fails on prototype pollution (softForm with urlencoded)", async () => {
	const bodyguard = new Bodyguard();

	const req = new Request("http://localhost", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "__proto__=a",
	});

	const result = await bodyguard.softForm(req, {
		a: 1,
		b: 2,
	});

	assert.equal(result.success, false);

	if (!result.success) {
		assert.equal(result.error, ERRORS.INVALID_INPUT);
	}
});

test("it fails on too many input bytes (softForm with urlencoded)", async () => {
	const bodyguard = new Bodyguard({
		maxSize: 10,
	});

	const req = new Request("http://localhost", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb",
	});

	const result = await bodyguard.softForm(req, {
		a: 1,
		b: 2,
	});

	assert.equal(result.success, false);

	if (!result.success) {
		assert.equal(result.error, ERRORS.MAX_SIZE_EXCEEDED);
	}
});

test("it fails on too many input keys (softForm with urlencoded)", async () => {
	const bodyguard = new Bodyguard({
		maxKeys: 5,
	});

	const req = new Request("http://localhost", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb",
	});

	const result = await bodyguard.softForm(req, {
		a: 1,
		b: 2,
	});

	assert.equal(result.success, false);

	if (!result.success) {
		assert.equal(result.error, ERRORS.TOO_MANY_KEYS);
	}
});

test("it fails on too long keys (softForm with urlencoded)", async () => {
	const bodyguard = new Bodyguard({
		maxKeyLength: 2,
	});

	const req = new Request("http://localhost", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "abc=1",
	});

	const result = await bodyguard.softForm(req, {
		a: {
			b: 1,
		},
	});

	assert.equal(result.success, false);

	if (!result.success) {
		assert.equal(result.error, ERRORS.KEY_TOO_LONG);
	}
});

test("it fails on invalid segment (softForm with urlencoded)", async () => {
	const bodyguard = new Bodyguard({
		maxDepth: 10,
	});

	const req = new Request("http://localhost", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "a=1&b=2&c.[].d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb",
	});

	const result = await bodyguard.softForm(req, {
		a: {
			b: 1,
		},
	});

	assert.equal(result.success, false);

	if (!result.success) {
		assert.equal(result.error, "Invalid segment encountered in segment: [] of path: c.[].d");
	}
});

test("it fails on too deep input (softForm with urlencoded)", async () => {
	const bodyguard = new Bodyguard({
		maxDepth: 1,
	});

	const req = new Request("http://localhost", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb",
	});

	const result = await bodyguard.softForm(req, {
		a: {
			b: 1,
		},
	});

	assert.equal(result.success, false);

	if (!result.success) {
		assert.equal(result.error, ERRORS.TOO_DEEP);
	}
});

test.run();
