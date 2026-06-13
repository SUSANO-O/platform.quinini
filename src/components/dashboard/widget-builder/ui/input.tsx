'use client';

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { className?: string };
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { className?: string };
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string };

export function WidgetBuilderInput({ className = '', ...props }: InputProps) {
  return <input className={`widget-builder-input${className ? ` ${className}` : ''}`} {...props} />;
}

export function WidgetBuilderSelect({ className = '', ...props }: SelectProps) {
  return <select className={`widget-builder-input${className ? ` ${className}` : ''}`} {...props} />;
}

export function WidgetBuilderTextarea({ className = '', ...props }: TextareaProps) {
  return <textarea className={`widget-builder-input${className ? ` ${className}` : ''}`} {...props} />;
}
