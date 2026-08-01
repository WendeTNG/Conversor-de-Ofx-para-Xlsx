import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

async function readApiError(response) {
  const data = await response.json().catch(() => ({}));
  return data.detail || 'Não foi possível processar o arquivo.';
}

function App() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  function selectFile(selected) {
    setFile(selected ?? null);
    setConversion(null);
    setError('');
    setStatus('idle');
  }

  async function convert() {
    if (!file) return;
    setStatus('processing');
    setError('');
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('/api/v1/conversions', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await readApiError(response));
      setConversion(await response.json());
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  async function download() {
    if (!conversion) return;
    setStatus('exporting');
    setError('');
    try {
      const response = await fetch(`/api/v1/conversions/${conversion.id}/export`, { method: 'POST' });
      if (!response.ok) throw new Error(await readApiError(response));
      const exportData = await response.json();
      const link = document.createElement('a');
      link.href = exportData.download_url;
      link.download = exportData.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('ready');
    }
  }

  return <main className="shell">
    <header>
      <div className="brand"><span className="brand-mark">↯</span><span>OFX para Excel</span></div>
      <span className="privacy">Sem cadastro · Arquivos temporários</span>
    </header>
    <section className="hero">
      <p className="eyebrow">CONVERSÃO SEGURA</p>
      <h1>Seu extrato, em uma planilha pronta para usar.</h1>
      <p className="subtitle">Envie um arquivo OFX, revise as transações e baixe o Excel. Seus dados não ficam armazenados permanentemente.</p>
    </section>
    <section className="card">
      <input ref={inputRef} className="hidden" type="file" accept=".ofx,application/x-ofx,text/ofx,text/xml,application/xml" onChange={(e) => selectFile(e.target.files?.[0])} />
      <div className="upload" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); selectFile(e.dataTransfer.files?.[0]); }}>
        <div className="upload-icon">↑</div>
        {file ? <><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · Clique para trocar</span></> : <><strong>Arraste seu arquivo OFX aqui</strong><span>ou clique para selecionar</span></>}
      </div>
      <button className="primary" disabled={!file || status === 'processing' || status === 'exporting'} onClick={convert}>
        {status === 'processing' ? 'Processando extrato…' : 'Analisar arquivo'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    {conversion && <section className="results">
      <div className="result-top">
        <div><p className="eyebrow">ARQUIVO ANALISADO</p><h2>{conversion.summary.transaction_count} transações encontradas</h2></div>
        <button className="primary" disabled={status === 'exporting'} onClick={download}>{status === 'exporting' ? 'Gerando Excel…' : 'Baixar Excel (.xlsx)'}</button>
      </div>
      <div className="metrics"><Metric label="Período" value={conversion.summary.period || 'Não identificado'} /><Metric label="Créditos" value={conversion.summary.credits} /><Metric label="Débitos" value={conversion.summary.debits} /></div>
      {conversion.warnings.length > 0 && <div className="warnings">{conversion.warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}</div>}
      <div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th className="amount">Valor</th></tr></thead><tbody>{conversion.preview.map((item, index) => <tr key={`${item.identifier}-${index}`}><td>{item.date || '—'}</td><td>{item.type || '—'}</td><td>{item.description || '—'}</td><td className={`amount ${item.amount < 0 ? 'negative' : 'positive'}`}>{item.amount_formatted}</td></tr>)}</tbody></table></div>
      <p className="footnote">Prévia de até 20 lançamentos. O arquivo convertido expira automaticamente em 60 minutos.</p>
    </section>}
  </main>;
}
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
createRoot(document.getElementById('root')).render(<App />);
