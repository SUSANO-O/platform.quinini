'use client';
import { useEffect } from 'react';

export function CardProTracker() {
  useEffect(() => {
    function onMove(this: HTMLElement, e: MouseEvent) {
      const rect = this.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
      this.style.setProperty('--card-angle', `${angle.toFixed(1)}deg`);
    }
    function onLeave(this: HTMLElement) {
      this.style.removeProperty('--card-angle');
    }

    const cards = document.querySelectorAll<HTMLElement>('.card-pro');
    cards.forEach(card => {
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
    });
    return () => {
      cards.forEach(card => {
        card.removeEventListener('mousemove', onMove);
        card.removeEventListener('mouseleave', onLeave);
      });
    };
  }, []);
  return null;
}
