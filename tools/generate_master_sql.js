const fs = require('fs');

try {
    const rawData = fs.readFileSync('C:\\Users\\ThinkPad\\Downloads\\nexa_core_identity_rows.json', 'utf8');
    const data = JSON.parse(rawData);

    // Filter and sort based on the user's current messed up IDs
    const core = data.filter(d => d.id >= 1 && d.id <= 10).sort((a,b) => a.id - b.id);
    const knowledge = data.filter(d => d.id >= 128 && d.id <= 208).sort((a,b) => a.id - b.id);
    const telemetry = data.filter(d => d.id >= 92 && d.id <= 127).sort((a,b) => a.id - b.id);

    // Combine in the perfect logical order
    const combined = [...core, ...knowledge, ...telemetry];

    let sql = `-- N.E.X.A CORE IDENTITY - PERFECTLY ORDERED MASTER SCRIPT\n`;
    sql += `-- Total: 127 Baris (10 Core, 81 Knowledge, 36 Telemetry)\n\n`;
    sql += `TRUNCATE TABLE "public"."nexa_core_identity" RESTART IDENTITY;\n\n`;
    sql += `INSERT INTO "public"."nexa_core_identity" ("id", "content") VALUES\n`;

    const values = combined.map((item, index) => {
        const newId = index + 1;
        // Escape single quotes for SQL insertion
        const safeContent = item.content.replace(/'/g, "''");
        return `(${newId}, '${safeContent}')`;
    });

    sql += values.join(',\n') + ';\n';

    fs.writeFileSync('d:\\N.E.X.A Asistant\\database\\nexa_core_identity_master.sql', sql);
    console.log("Master SQL created successfully at database/nexa_core_identity_master.sql");
} catch (error) {
    console.error("Error generating SQL:", error);
}
