import * as mz from "mz/fs";
import * as chai from "chai";

describe("Baseline comparison", () => {
    it("should same", async () => {
        chai.assert.deepEqual(await mz.readFile("built/browser.webidl.xml", "utf8"), await mz.readFile("baseline/browser.webidl.xml", "utf8"));
    })
})