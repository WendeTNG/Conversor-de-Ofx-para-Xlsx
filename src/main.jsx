import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

async function readApiError(response) {
  const data = await response.json().catch(() => ({}));
  return data.detail || 'Não foi possível processar o arquivo.';
}

function App() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const busy = status === 'processing' || status === 'exporting';

  function selectFiles(selected) {
    if (busy) return;
    setFiles(Array.from(selected ?? []));
    setResults([]);
    setError('');
    setStatus('idle');
  }

  async function convert() {
    if (!files.length || busy) return;
    setStatus('processing');
    setError('');
    setResults([]);
    const completed = [];
    for (const [index, file] of files.entries()) {
      const form = new FormData();
      form.append('file', file);
      try {
        const response = await fetch('/api/v1/conversions', { method: 'POST', body: form });
        if (!response.ok) throw new Error(await readApiError(response));
        completed.push({ index, file, conversion: await response.json() });
      } catch (err) {
        completed.push({ index, file, error: err.message });
      }
      setResults([...completed]);
    }
    setStatus('ready');
  }

  async function download() {
    const converted = results.filter((result) => result.conversion);
    if (!converted.length || busy) return;
    setStatus('exporting');
    setError('');
    const form = new FormData();
    converted.forEach(({ file }) => form.append('files', file));
    try {
      const response = await fetch('/api/v1/conversions/export-zip', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await readApiError(response));
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(await response.blob());
      link.href = objectUrl;
      link.download = 'Planilhas Compactadas.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
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
      <p className="subtitle">Envie seus arquivos OFX e baixe as planilhas Excel em um único ZIP. Seus dados não ficam armazenados permanentemente.</p>
    </section>
    <section className="card">
      <input ref={inputRef} className="hidden" type="file" multiple disabled={busy} accept=".ofx,application/x-ofx,text/ofx,text/xml,application/xml" onChange={(e) => selectFiles(e.target.files)} />
      <div className="upload" aria-disabled={busy} onClick={() => { if (!busy) inputRef.current?.click(); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); selectFiles(e.dataTransfer.files); }}>
        <div className="upload-icon">↑</div>
        {files.length ? <><strong>{files.length} arquivo(s) selecionado(s)</strong><span>{(files.reduce((total, file) => total + file.size, 0) / 1024).toFixed(1)} KB · Clique para trocar a seleção</span></> : <><strong>Arraste seus arquivos OFX aqui</strong><span>ou clique para selecionar um ou mais arquivos</span></>}
      </div>
      {files.length > 0 && <ul className="selected-files" aria-label="Arquivos selecionados">{files.map((file, index) => <li key={index}>{file.name}</li>)}</ul>}
      <button className="primary" disabled={!files.length || busy} onClick={convert}>
        {status === 'processing' ? `Processando arquivos… ${results.length}/${files.length}` : 'Analisar arquivos'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    {results.length > 0 && <section className="results" aria-live="polite">
      <div className="result-top">
        <div><p className="eyebrow">ARQUIVOS ANALISADOS</p><h2>{results.filter((result) => result.conversion).length} de {files.length} arquivo(s) convertido(s)</h2></div>
        <button className="primary" disabled={busy || !results.some((result) => result.conversion)} onClick={download}>{status === 'exporting' ? 'Gerando ZIP…' : 'Baixar planilhas (.zip)'}</button>
      </div>
      {results.some((result) => result.error) && <p className="footnote">O ZIP inclui apenas os arquivos convertidos com sucesso.</p>}
      <ul className="file-list" aria-label="Arquivos analisados">
        {results.map(({ index, file, conversion, error: fileError }) => <li className="file-row" key={index}>
          <div className="file-name"><span>Arquivo</span><strong>{file.name}</strong></div>
          {conversion ? <>
            <div><span>Banco</span><strong>{conversion.summary.bank || 'Não informado'}</strong></div>
            <div><span>Conta</span><strong>{conversion.summary.account || 'Não informada'}</strong></div>
            <div className="file-details">
              <p>{conversion.summary.transaction_count} transações encontradas</p>
              <div className="metrics"><Metric label="Período" value={conversion.summary.period || 'Não identificado'} /><Metric label="Créditos" value={conversion.summary.credits} /><Metric label="Débitos" value={conversion.summary.debits} /></div>
              {conversion.warnings.length > 0 && <div className="warnings">{conversion.warnings.map((warning, warningIndex) => <p key={warningIndex}>⚠ {warning}</p>)}</div>}
            </div>
          </> : <p className="error file-details" role="alert">{fileError}</p>}
        </li>)}
      </ul>
      <p className="footnote">O arquivo convertido expira automaticamente em 60 minutos.</p>
    </section>}
  </main>;
}
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
createRoot(document.getElementById('root')).render(<App />);
