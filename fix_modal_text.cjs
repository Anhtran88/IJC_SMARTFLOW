const fs = require('fs');
const path = 'src/components/RtdbToFirestoreMigrationTool.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace texts in the modal
content = content.replace(/từ <strong[^>]*>Cloud Firestore<\/strong> sang <strong[^>]*>Realtime Database \(RTDB\)<\/strong>/, 'từ <strong className="text-rose-400">Realtime Database (RTDB)</strong> sang <strong className="text-amber-400">Cloud Firestore</strong>');
content = content.replace(/Bạn đang chuẩn bị chuyển toàn bộ dữ liệu từ <strong className="text-rose-400">Cloud Firestore<\/strong> sang <strong className="text-amber-400">Realtime Database \(RTDB\)<\/strong>/, 'Bạn đang chuẩn bị chuyển toàn bộ dữ liệu từ <strong className="text-amber-400">Realtime Database (RTDB)</strong> sang <strong className="text-rose-400">Cloud Firestore</strong>');
content = content.replace(/của Realtime Database trước khi ghi/g, 'của Cloud Firestore trước khi ghi');
content = content.replace(/Dữ liệu Firestore gốc được giữ nguyên/g, 'Dữ liệu RTDB gốc được giữ nguyên');

fs.writeFileSync(path, content);
