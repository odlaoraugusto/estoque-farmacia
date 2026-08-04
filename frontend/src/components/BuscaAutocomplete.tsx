import { useState } from 'react';

interface BuscaAutocompleteProps<T> {
  id?: string;
  itens: T[];
  valor: string;
  aoMudarValor: (valor: string) => void;
  rotulo: (item: T) => string;
  chave: (item: T) => string | number;
  aoSelecionar: (item: T) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Campo de busca com sugestões — usado em Entrada (medicamento),
 * Transferência/Descarte (lote) e Saída (medicamento p/ FEFO). Genérico
 * para não duplicar a mesma lógica de filtro/abrir-fechar em cada tela. */
export function BuscaAutocomplete<T>({
  id,
  itens,
  valor,
  aoMudarValor,
  rotulo,
  chave,
  aoSelecionar,
  placeholder,
  disabled,
}: BuscaAutocompleteProps<T>) {
  const [aberto, setAberto] = useState(false);

  const filtrados = valor.trim()
    ? itens.filter((item) => rotulo(item).toLowerCase().includes(valor.trim().toLowerCase())).slice(0, 8)
    : itens.slice(0, 8);

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={valor}
        disabled={disabled}
        onChange={(e) => {
          aoMudarValor(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
      />
      {aberto && !disabled && (
        <ul className="autocomplete-list">
          {filtrados.length === 0 && <li className="vazio">Nenhum resultado.</li>}
          {filtrados.map((item) => (
            <li key={chave(item)}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  aoSelecionar(item);
                  setAberto(false);
                }}
              >
                {rotulo(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
