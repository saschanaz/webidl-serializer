import * as mz from "mz/fs";
import * as chai from "chai";

describe("Baseline comparison", () => {
    it("should same", async () => {
        const linebreak = /\r?\n/;
        const output = (await mz.readFile("built/browser.webidl.json", "utf8")).split(linebreak);
        const baseline = (await mz.readFile("baseline/browser.webidl.json", "utf8")).split(linebreak);
        
        chai.assert.strictEqual(output.length, baseline.length, `Output length is different from baseline`);
        for (let i = 0; i < baseline.length; i++) {
            chai.assert.strictEqual(output[i], baseline[i], `Diff found on line ${i}:`);
        }
    })
})