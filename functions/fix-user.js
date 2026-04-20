const admin = require('firebase-admin');

// Use application default credentials (firebase CLI login)
admin.initializeApp({
  projectId: 'germany-8069b'
});

const db = admin.firestore();
const uid = 'orLL8geDtmgPmo166kUNOFtfYvB3';

async function main() {
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  console.log('Existing doc:', snap.exists ? JSON.stringify(snap.data()) : 'DOES NOT EXIST');
  
  await ref.set({
    active: true,
    role: 'admin',
    email: 'test@test.es',
    updatedAt: new Date().toISOString()
  }, { merge: true });
  
  console.log('✅ User document updated with active: true, role: admin');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
