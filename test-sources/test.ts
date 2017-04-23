import * as mz from "mz/fs";
import * as chai from "chai";

describe("Baseline comparison", () => {
    it("should same", async () => {
        const output = (await mz.readFile("built/browser.webidl.xml", "utf8")).split('\n');
        const baseline = (await mz.readFile("baseline/browser.webidl.xml", "utf8")).split('\n');
        
        chai.assert.strictEqual(output.length, baseline.length);
        for (let i = 0; i < baseline.length; i++) {
            try {
                chai.assert.strictEqual(output[i], baseline[i]);
            }
            catch (e) {
                e.message = `Diff found on line ${i}:`;
                throw e;
            }
        }
    })
})