const { main } = require("./index");
const sh = require("shelljs");
const fs = require("fs");
const semver = require("semver");

describe("main", () => {
  const tsVersions = ["3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "4.0", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7"];

  if (fs.existsSync(`baselines/local`)) {
    sh.rm("-r", `baselines/local`);
  }

  for (const tsVersion of tsVersions) {
    test(
      "downlevel TS to " + tsVersion,
      () => {
        main("test", `baselines/local/ts${tsVersion}`, semver.coerce(tsVersion));

        expect(fs.readFileSync(`baselines/local/ts${tsVersion}/test.d.ts`, "utf8")).toEqual(
          fs.readFileSync(`baselines/reference/ts${tsVersion}/test.d.ts`, "utf8")
        );
        expect(fs.readFileSync(`baselines/local/ts${tsVersion}/src/test.d.ts`, "utf8")).toEqual(
          fs.readFileSync(`baselines/reference/ts${tsVersion}/src/test.d.ts`, "utf8")
        );
      },
      10 * 1000
    );
  }
});
