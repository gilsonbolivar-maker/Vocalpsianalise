import { Trash2 } from 'lucide-react';
import type { AppScreen } from '../types/analysis.ts';

interface TopBarProps {
  screen: AppScreen;
  hasSession: boolean;
  onNavigate: (screen: AppScreen) => void;
  onOpenQuickGuide: () => void;
  onOpenSettings: () => void;
  onClearSession: () => void;
}

export function TopBar({
  screen,
  hasSession,
  onNavigate,
  onOpenQuickGuide,
  onOpenSettings,
  onClearSession,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:gap-8 sm:px-6">
        {/* Zona 1: Marca única em uma linha */}
        <button
          type="button"
          onClick={() => onNavigate(hasSession ? 'resultado' : 'inicio')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:text-xl"
        >
          Vocalpsianalise
        </button>

        {/* Zona 2: Links de navegação concisos em linha única */}
        <nav
          aria-label="Navegação principal"
          className="flex items-center gap-4 overflow-x-auto text-sm font-medium text-slate-600 sm:gap-6 sm:text-base"
        >
          <button
            type="button"
            onClick={() => onNavigate('inicio')}
            className={`min-h-[44px] whitespace-nowrap shrink-0 border-b-2 px-1 transition-colors ${
              screen === 'inicio'
                ? 'border-teal-700 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Início
          </button>

          {hasSession && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('resultado')}
                className={`min-h-[44px] whitespace-nowrap shrink-0 border-b-2 px-1 transition-colors ${
                  screen === 'resultado'
                    ? 'border-teal-700 text-slate-900 font-semibold'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                Resultado
              </button>
              <button
                type="button"
                onClick={() => onNavigate('exportar')}
                className={`min-h-[44px] whitespace-nowrap shrink-0 border-b-2 px-1 transition-colors ${
                  screen === 'exportar'
                    ? 'border-teal-700 text-slate-900 font-semibold'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                Exportar
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenQuickGuide}
            className="min-h-[44px] whitespace-nowrap shrink-0 border-b-2 border-transparent px-1 transition-colors hover:text-slate-900"
          >
            Guia rápido
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[44px] whitespace-nowrap shrink-0 border-b-2 border-transparent px-1 transition-colors hover:text-slate-900"
          >
            Configurações
          </button>
        </nav>

        {/* Zona 3: 1 ação principal contextual */}
        <div className="shrink-0">
          {hasSession ? (
            <button
              type="button"
              onClick={onClearSession}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100 active:scale-[0.99] whitespace-nowrap shrink-0 sm:px-4"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Apagar tudo desta sessão</span>
              <span className="sm:hidden">Apagar tudo</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSettings}
              className="hidden min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 sm:inline-flex"
            >
              Privacidade e LGPD
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
