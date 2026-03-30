import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { describe, beforeAll, afterAll, beforeEach, it } from "vitest";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

suite("firestore rules", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-einsatzbericht",
      firestore: {
        rules: readFileSync(resolve(process.cwd(), "../firestore.rules"), "utf8")
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users/tech-1"), { role: "technician", active: true });
      await setDoc(doc(db, "users/tech-2"), { role: "technician", active: true });
      await setDoc(doc(db, "templates/svt"), { id: "svt", name: "SVT" });
      await setDoc(doc(db, "clients/client-1"), {
        createdBy: "tech-1",
        email: "kunde@example.com",
        phone: "+34",
        location: "Madrid"
      });
      await setDoc(doc(db, "reports/report-1"), {
        createdBy: "tech-1",
        status: "draft",
        projectInfo: { projectNumber: "P-1", locationObject: "Objekt" }
      });
      await setDoc(doc(db, "reports/report-final"), {
        createdBy: "tech-1",
        status: "finalized",
        projectInfo: { projectNumber: "P-2", locationObject: "Objekt" }
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows owner to update draft report", async () => {
    const ctx = testEnv.authenticatedContext("tech-1");
    const db = ctx.firestore();

    await assertSucceeds(updateDoc(doc(db, "reports/report-1"), { "projectInfo.projectNumber": "P-1-UPDATED", status: "draft" }));
  });

  it("denies owner updates after finalized status", async () => {
    const ctx = testEnv.authenticatedContext("tech-1");
    const db = ctx.firestore();

    await assertFails(updateDoc(doc(db, "reports/report-final"), { "projectInfo.projectNumber": "NO" }));
  });

  it("allows owner to delete draft report", async () => {
    const ctx = testEnv.authenticatedContext("tech-1");
    const db = ctx.firestore();

    await assertSucceeds(deleteDoc(doc(db, "reports/report-1")));
  });

  it("denies owner deleting finalized report", async () => {
    const ctx = testEnv.authenticatedContext("tech-1");
    const db = ctx.firestore();

    await assertFails(deleteDoc(doc(db, "reports/report-final")));
  });

  it("allows technician to read templates", async () => {
    const ctx = testEnv.authenticatedContext("tech-1");
    const db = ctx.firestore();

    await assertSucceeds(getDoc(doc(db, "templates/svt")));
  });

  it("denies access to another technician report", async () => {
    const ctx = testEnv.authenticatedContext("tech-2");
    const db = ctx.firestore();

    await assertFails(getDoc(doc(db, "reports/report-1")));
  });

  it("allows owner to read and update own client", async () => {
    const ctx = testEnv.authenticatedContext("tech-1");
    const db = ctx.firestore();

    await assertSucceeds(getDoc(doc(db, "clients/client-1")));
    await assertSucceeds(updateDoc(doc(db, "clients/client-1"), { phone: "+34 666 000 000" }));
  });

  it("denies access to another technician client", async () => {
    const ctx = testEnv.authenticatedContext("tech-2");
    const db = ctx.firestore();

    await assertFails(getDoc(doc(db, "clients/client-1")));
  });
});
