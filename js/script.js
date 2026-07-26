// ==========================================================================
// Reveal on scroll
// ==========================================================================
const els = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: .12 });
els.forEach(el => io.observe(el));

// ==========================================================================
// Tape measure scroll rail
// ==========================================================================
const fill = document.getElementById('tape-fill');
const num = document.getElementById('tape-num');

function updateTape() {
  const doc = document.documentElement;
  const scrollTop = window.scrollY;
  const max = doc.scrollHeight - window.innerHeight;
  const pct = max > 0 ? Math.min(1, scrollTop / max) : 0;
  
  if (fill) fill.style.height = (pct * 100) + '%';
  
  const cm = Math.round(pct * 210);
  if (num) {
    num.textContent = cm;
    num.style.top = 'calc(' + (pct * 100) + '% - 8px)';
  }
}
window.addEventListener('scroll', updateTape, { passive: true });
window.addEventListener('resize', updateTape);
document.addEventListener('DOMContentLoaded', updateTape);

// ==========================================================================
// Header background on scroll
// ==========================================================================
const header = document.querySelector('header');
if (header) {
  window.addEventListener('scroll', () => {
    header.style.background = window.scrollY > 40
      ? 'rgba(243,233,214,0.96)'
      : 'rgba(243,233,214,0.86)';
  }, { passive: true });
}

// ==========================================================================
// Carrossel Automático de Avaliações
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  const track = document.getElementById('reviews-track');
  
  if (track) {
    const items = Array.from(track.children);
    const gap = 20; 
    
    // Clona os itens para criar o efeito infinito
    items.forEach(item => {
      const clone = item.cloneNode(true);
      track.appendChild(clone);
    });

    let position = 0;
    let speed = 1; 
    let isHovered = false;

    function animateCarousel() {
      if (!isHovered) {
        position -= speed;
        
        // Calcula a largura total dos itens originais (antes de serem clonados)
        const originalWidth = items.reduce((acc, item) => acc + item.offsetWidth + gap, 0);

        // Se o carrossel rolar o tamanho total original, ele reseta para o zero silenciosamente
        if (Math.abs(position) >= originalWidth) {
          position = 0;
        }
        
        track.style.transform = `translateX(${position}px)`;
      }
      requestAnimationFrame(animateCarousel);
    }

    animateCarousel();

    // Eventos para pausar o carrossel quando o usuário passar o mouse ou segurar no celular
    track.addEventListener('mouseenter', () => isHovered = true);
    track.addEventListener('mouseleave', () => isHovered = false);
    
    track.addEventListener('touchstart', () => isHovered = true, { passive: true });
    track.addEventListener('touchend', () => {
      setTimeout(() => isHovered = false, 1000); 
    }, { passive: true });
  }
});