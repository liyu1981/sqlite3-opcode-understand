import { useEffect, useRef, useState } from "react";

import { JSDOM } from 'jsdom';
import got from 'got';

const localStorageKey = "sqlite3opcodeunderstand_lastplan";

const sqliteOpcodeUrl = 'https://www.sqlite.org/opcode.html';

function genOpcodeTabFromDom(tabEl) {
  const opcodeTab = {};
  const rows = tabEl.querySelectorAll('tr');
  rows.forEach(row => {
    const [td1, td2] = row.querySelectorAll('td');
    if (td1 && td2) {
      opcodeTab[td1.textContent.trim()] = td2.innerHTML;
    }
  });
  return opcodeTab;
}

function genOpcodeTab() {
  return got(sqliteOpcodeUrl).then(response => {
    const dom = new JSDOM(response.body);
    //console.log(dom.window.document.querySelector('div.optab table').textContent);
    return genOpcodeTabFromDom(dom.window.document.querySelector('div.optab table'));
  }).catch(err => {
    console.log(err);
  });
}

export async function getServerSideProps(context) {
  const opcodeTab = await genOpcodeTab();
  return {
    props: { opcodeTab }, // will be passed to the page component as props
  }
}

function PlanView({ code, setCode, setOpCodeSelected }) {
  const taRef = useRef();
  function textAreaAdjust(element) {
    if (element) {
      element.style.height = "1px";
      element.style.height = (25 + element.scrollHeight) + "px";
    }
  }
  function getSel(element) {
    if (element) {
      // Obtain the index of the first selected character
      const start = element.selectionStart;
      // Obtain the index of the last selected character
      const finish = element.selectionEnd;
      // Obtain the selected text
      const sel = element.value.substring(start, finish);
      return sel;
    } else {
      return '';
    }
  }
  useEffect(() => {
    textAreaAdjust(taRef.current);
  }, [code]);
  return (
    <div >
      <textarea ref={taRef}
        className="border-zinc-500 border p-1 w-full min-h-fit font-mono"
        onChange={(e) => setCode(e.target.value)}
        onDoubleClick={(e) => {
          const s = getSel(taRef.current);
          if (s.length > 0) {
            setOpCodeSelected(s);
          }
        }}
        value={code}>
      </textarea>
    </div>
  );
}

function OpCodeView({ opCodeSelected, opcodeTab }) {
  const opcodeDesc = opcodeTab[opCodeSelected] ?? null;
  return opcodeDesc === null
    ? (<div></div>)
    : (
      <div>
        <div className="bg-red-100 rounded mt-4 mb-8 p-2">
          <b>Opcode: </b><br></br>
          <span className="text-lg">{opCodeSelected}</span>
        </div>
        <div className="bg-sky-100 rounded p-2">
          <b>Description:</b><br />
          <div className="opcode-desc-container text-lg" dangerouslySetInnerHTML={{ __html: opcodeDesc }}></div>
        </div>
      </div>
    );
}

function getLastPlan() {
  const stored = window.localStorage.getItem(localStorageKey);
  return stored === null ? "" : stored;
}

const panelClassName = "bg-white m-4 rounded shadow-sm p-4";

export default function Home({ opcodeTab }) {
  const [code, setCodeImpl] = useState("");
  const [opCodeSelected, setOpCodeSelected] = useState(null);

  const setCode = (code) => {
    window.localStorage.setItem(localStorageKey, code);
    setCodeImpl(code);
  };

  useEffect(() => {
    const last = getLastPlan();
    setCodeImpl(last);
  }, []);

  return (
    <div>
      <div className="grid grid-cols-10 gap-4 fixed w-full" style={{ pointerEvents: "none" }}>
        <div className={panelClassName + " col-start-7 col-span-4"}>
          <h2 className="uppercase text-gray-400 mb-4">Sqlite Opcode Explanation</h2>
          <OpCodeView opCodeSelected={opCodeSelected} opcodeTab={opcodeTab} />
        </div>
      </div>
      <div className="grid grid-cols-10 gap-4">
        <div className={panelClassName + " col-span-6"}>
          <h2 className="uppercase text-gray-400 mb-4">Sqlite Query Plan</h2>
          <PlanView code={code} setCode={setCode} setOpCodeSelected={setOpCodeSelected} />
        </div>
      </div>
      <div className="flex flex-col">
        <div className="text-center mt-2">
          Read the doc of Sqlite3 Opcode here:
          <a href="https://www.sqlite.org/opcode.html" target="_blank" rel="noreferrer">https://www.sqlite.org/opcode.html</a>
        </div>
      </div>
    </div>
  );
}
