import type { ReactNode } from 'react';

interface AlertaProps {
  tipo: 'erro' | 'sucesso' | 'info';
  children: ReactNode;
}

/** Banner de feedback reutilizável — usado para erros de API (inclusive
 * 403 "sem permissão") e confirmações de sucesso, sempre com texto claro
 * em vez de deixar a tela travar ou quebrar. */
export function Alerta({ tipo, children }: AlertaProps) {
  return (
    <div className={`alerta ${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'} aria-live="polite">
      <span>{children}</span>
    </div>
  );
}
