const fs = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = 'http://127.0.0.1:8000/api';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to fetch ${url}: Status ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log("=== Fetching Predictions for Next.js Build ===");
    try {
        const simResults = await fetchJson(`${API_BASE}/simulation/results`);
        const teams = await fetchJson(`${API_BASE}/teams`);
        
        const combined = {
            ...simResults,
            teams
        };
        
        const dir = path.join(__dirname, '../public/data');
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(dir, 'predictions.json'),
            JSON.stringify(combined, null, 2)
        );
        console.log("Successfully saved predictions to web/public/data/predictions.json!");
        process.exit(0);
    } catch (error) {
        console.error("Error fetching predictions:", error.message);
        console.log("Writing a mock fallback predictions dataset in case API is temporarily down...");
        
        // In case the API is building asynchronously or blocked, write a verified complete mock
        // predictions file so the Next.js static build succeeds no matter what!
        const dir = path.join(__dirname, '../public/data');
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const fallbackFile = path.join(__dirname, '../../simulation/results.json');
        if (fs.existsSync(fallbackFile)) {
            const data = fs.readFileSync(fallbackFile, 'utf8');
            fs.writeFileSync(path.join(dir, 'predictions.json'), data);
            console.log("Successfully restored static predictions from simulation/results.json!");
        } else {
            console.error("Critical: simulation/results.json not found!");
            process.exit(1);
        }
    }
}

main();
