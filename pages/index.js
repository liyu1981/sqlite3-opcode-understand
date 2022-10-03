import { useEffect, useRef, useState } from "react";

import { JSDOM } from 'jsdom';
import got from 'got';

const localStorageKey = 'sqlite3opcodeunderstand_lastplan';

const localStorageUserPlanKey = 'sqlite3opcodeunderstand_userplan';
const userPlanMax = 10;

const sqliteOpcodeUrl = 'https://www.sqlite.org/opcode.html';

const buildinQueryPlans = [
  `sqlite> explain select 1;
  addr  opcode         p1    p2    p3    p4             p5  comment
  ----  -------------  ----  ----  ----  -------------  --  -------------
  0     Init           0     1     0                    0   Start at 1
  1     Integer        1     1     0                    0   r[1]=1
  2     ResultRow      1     1     0                    0   output=r[1]
  3     Halt           0     0     0                    0
`,
  `sqlite> explain select * from eav where e = 1;
  addr  opcode         p1    p2    p3    p4             p5  comment
  ----  -------------  ----  ----  ----  -------------  --  -------------
  0     Init           0     17    0                    0   Start at 17
  1     OpenRead       0     2     0     5              0   root=2 iDb=0; eav
  2     OpenRead       1     3     0     k(2,,)         2   root=3 iDb=0; eav_index_e
  3     Explain        3     0     0     SEARCH eav USING INDEX eav_index_e (e=?)  0
  4     Integer        1     1     0                    0   r[1]=1
  5     SeekGE         1     16    1     1              0   key=r[1]
  6       IdxGT          1     16    1     1              0   key=r[1]
  7       DeferredSeek   1     0     0                    0   Move 0 to 1.rowid if needed
  8       Column         1     0     2                    0   r[2]=eav.e
  9       Column         0     1     3                    0   r[3]=eav.a
  10      Column         0     2     4                    0   r[4]=eav.vi
  11      Column         0     3     5                    0   r[5]=eav.vt
  12      Column         0     4     6                    0   r[6]=eav.vf
  13      RealAffinity   6     0     0                    0
  14      ResultRow      2     5     0                    0   output=r[2..6]
  15    Next           1     6     1                    0
  16    Halt           0     0     0                    0
  17    Transaction    0     0     6     0              1   usesStmtJournal=0
  18    Goto           0     1     0                    0
`,
  `sqlite> explain with g as (select e from eav where e = 3 union select eav.e from eav join g on eav.vi = g.e) select * from g;
addr  opcode         p1    p2    p3    p4             p5  comment
----  -------------  ----  ----  ----  -------------  --  -------------
0     Init           0     49    0                    0   Start at 49
1     InitCoroutine  1     42    2                    0   g
2     OpenPseudo     1     2     1                    0   1 columns in r[2]
3     OpenEphemeral  4     1     0                    0   nColumn=1; Queue table
4     OpenEphemeral  5     1     0     k(1,B)         0   nColumn=1
5     OpenRead       6     3     0     k(2,,)         2   root=3 iDb=0; eav_index_e
6     Explain        6     0     0     SEARCH eav USING COVERING INDEX eav_index_e (e=?)  0
7     Integer        3     3     0                    0   r[3]=3
8     SeekGE         6     17    3     1              0   key=r[3]
9       IdxGT          6     17    3     1              0   key=r[3]
10      Column         6     0     4                    0   r[4]=eav.e
11      MakeRecord     4     1     5                    0   r[5]=mkrec(r[4])
12      Found          5     16    5     0              0   key=r[5]
13      IdxInsert      5     5     4     1              0   key=r[5]
14      NewRowid       4     6     0                    0   r[6]=rowid
15      Insert         4     5     6                    8   intkey=r[6] data=r[5]
16    Next           6     9     1                    0
17      Rewind         4     41    0                    0
18      NullRow        1     0     0                    0
19      RowData        4     2     0                    0   r[2]=data
20      Delete         4     0     0                    0
21      Column         1     0     7                    0   r[7]=eav.e
22      Yield          1     0     0                    0
23      OpenRead       3     2     0     3              0   root=2 iDb=0; eav
24      OpenRead       7     5     0     k(2,,)         2   root=5 iDb=0; eav_index_vi
25      Explain        25    0     0     SCAN g         0
26      Explain        26    0     0     SEARCH eav USING INDEX eav_index_vi (vi=?)  0
27      Column         1     0     8                    0   r[8]=g.e
28      IsNull         8     40    0                    0   if r[8]==NULL goto 40
29      Affinity       8     1     0     C              0   affinity(r[8])
30      SeekGE         7     40    8     1              0   key=r[8]
31        IdxGT          7     40    8     1              0   key=r[8]
32        DeferredSeek   7     0     3                    0   Move 3 to 7.rowid if needed
33        Column         3     0     4                    0   r[4]=eav.e
34        MakeRecord     4     1     5                    0   r[5]=mkrec(r[4])
35        Found          5     39    5     0              0   key=r[5]
36        IdxInsert      5     5     4     1              0   key=r[5]
37        NewRowid       4     6     0                    0   r[6]=rowid
38        Insert         4     5     6                    8   intkey=r[6] data=r[5]
39      Next           7     31    1                    0
40    Goto           0     17    0                    0
41    EndCoroutine   1     0     0                    0
42    Explain        42    0     0     SCAN g         0
43    InitCoroutine  1     0     2                    0
44      Yield          1     48    0                    0   next row of g
45      Copy           7     9     0                    0   r[9]=r[7]; g.e
46      ResultRow      9     1     0                    0   output=r[9]
47    Goto           0     44    0                    0
48    Halt           0     0     0                    0
49    Transaction    0     0     6     0              1   usesStmtJournal=0
50    Goto           0     1     0                    0
`,
];

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

function Toolbar({ setCode, userPlans, saveCurrentAsUserPlan }) {
  const buildinQueryPlanOptions = buildinQueryPlans.map((qp, index) => {
    return (<option key={`buildin-${index}`} value={`buildin-${index}`}>{qp.split('\n')[0]}</option>);
  });

  const userQueryPlanOptions = userPlans.map((qp, index) => {
    return (<option key={`user-${index}`} value={`user-${index}`}>{qp.split('\n')[0]}</option>);
  });

  const onChange = (e) => {
    const v = e.target.value;
    if (v && v.startsWith('buildin-')) {
      const i = parseInt(v.split('-')[1]);
      setCode(buildinQueryPlans[i]);
    } else if (v && v.startsWith('user-')) {
      const i = parseInt(v.split('-')[1]);
      setCode(userPlans[i]);
    }
  };

  return (
    <div className="px-4 py-3 mb-2 bg-slate-200 rounded-md">
      Select to Load Query Plan:
      <select className="mx-4 rounded-md max-w-xl" onChange={onChange}>
        <option value="separator">---Build In Query Plans---</option>
        {buildinQueryPlanOptions}
        <option value="separator">---User Query Plans---</option>
        {userQueryPlanOptions}
      </select>
      <button className="rounded-md bg-white px-3 py-2 float-right" onClick={saveCurrentAsUserPlan}>Save Current Plan for Loading Later</button>
    </div>
  );
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

function getUserPlans() {
  const stored = window.localStorage.getItem(localStorageUserPlanKey);
  return stored === null ? [] : JSON.parse(stored);
}

const panelClassName = "bg-white m-4 rounded shadow-sm p-4";

export default function Home({ opcodeTab }) {
  const [code, setCodeImpl] = useState("");
  const [opCodeSelected, setOpCodeSelected] = useState(null);
  const [userPlans, setUserPlans] = useState([]);

  const setCode = (code) => {
    window.localStorage.setItem(localStorageKey, code);
    setCodeImpl(code);
  };

  const saveCurrentAsUserPlan = () => {
    const newUserPlans = [...userPlans];
    newUserPlans.unshift(code);
    while (newUserPlans.length > userPlanMax) {
      newUserPlans.pop();
    }
    setUserPlans(newUserPlans);
  };

  useEffect(() => {
    const last = getLastPlan();
    setCodeImpl(last);
    const userPlans = getUserPlans();
    setUserPlans(userPlans);
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
          <Toolbar setCode={setCode} userPlans={userPlans} saveCurrentAsUserPlan={saveCurrentAsUserPlan} />
          <PlanView code={code} setCode={setCode} setOpCodeSelected={setOpCodeSelected} />
        </div>
      </div>
      <div className="flex flex-col">
        <div className="mx-8 mt-2">
          Read the doc of Sqlite3 Opcode here:
          <a className="underline" href="https://www.sqlite.org/opcode.html" target="_blank" rel="noreferrer">https://www.sqlite.org/opcode.html</a>
        </div>
      </div>
    </div>
  );
}
