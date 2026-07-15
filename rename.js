const fs = require('fs');
const path = require('path');
const dir = 'C:/Users/DIBER VEGA/Desktop/GESTION';

// Update HTML files
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
files.forEach(f => {
  const p = path.join(dir, f);
  let content = fs.readFileSync(p, 'utf8');
  let changed = false;
  
  if (content.includes('Gestión Deportiva')) {
    content = content.replace(/Gestión Deportiva/g, 'Gestión DIBER');
    changed = true;
  }
  if (content.includes('<div class="loader-logo">??')) {
    content = content.replace(/<div class="loader-logo">??/g, '<div class="loader-logo">??');
    changed = true;
  }
  
  // Specific replacements for index.html
  if (f === 'index.html') {
    content = content.replace('<div class="login-hero-icon">??</div>', '<div class="login-hero-icon">??</div>');
    content = content.replace('de tu empresa deportiva.', '.');
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(p, content);
    console.log('Updated ' + f);
  }
});

// Update js/shared.js
const sharedPath = path.join(dir, 'js', 'shared.js');
if (fs.existsSync(sharedPath)) {
  let sContent = fs.readFileSync(sharedPath, 'utf8');
  sContent = sContent.replace('<div class="sidebar-logo-icon">??</div>', '<div class="sidebar-logo-icon" style="background: linear-gradient(135deg, var(--primary-400), var(--accent-violet))">??</div>');
  sContent = sContent.replace('<div class="sidebar-logo-text">Gestión</div>', '<div class="sidebar-logo-text">Gestión DIBER</div>');
  sContent = sContent.replace('<div class="sidebar-logo-sub">Servicios Deportivos</div>', '<div class="sidebar-logo-sub">Panel Administrativo</div>');
  fs.writeFileSync(sharedPath, sContent);
  console.log('Updated js/shared.js');
}
