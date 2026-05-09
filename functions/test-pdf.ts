import { PDFDocument, StandardFonts } from "pdf-lib";

async function run() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 500]);
  const form = doc.getForm();
  const textField = form.createTextField('test.field');
  textField.addToPage(page, { x: 50, y: 50, width: 400, height: 400 });
  
  textField.enableMultiline();
  textField.setText("This is a very long text that should wrap around because it is very long and if it does not wrap then there is a problem. ".repeat(10));
  
  const pdfBytes = await doc.save();
  console.log("PDF created successfully, bytes:", pdfBytes.length);
}
run().catch(console.error);
