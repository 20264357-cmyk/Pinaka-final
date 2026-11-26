// Wealthness JavaScript: Controls interactive features and shared data used by all pages.

// Shared browser-storage key used by every Wealthness page.
// Storage key: Names the browser storage entry where Wealthness saves its data.
const STORAGE_KEY = "wealthnessData_v2";

// Formatting helpers: Keep money amounts and dates consistent throughout the website.
const money = n => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(Number(n)||0);
// Use the browser’s local date so dates stay correct in the user’s timezone.
const todayISO = () => formatLocalDate(new Date());
const uid = () => "w_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const escapeHTML = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// One shared data object powers every page. Pages read the parts they need
// and save changes here so the dashboard and other summaries stay in sync.
// Default data: Provides an empty starting structure when there are no saved records.
const defaultData = () => ({
    transactions:[],
    budgets:{},
    goals:[],
    debts:[],
    accounts:[],
    recurring:[],
    plannedPayments:[],
    challengeState:null,
    customCategories:[],
    planner:{income:"",essential:"",rate:20,goal:"",months:12},
    settings:{name:"",currency:"PHP"}
});

// Load saved records when the app opens. Defaults keep older backups compatible.
// Reads previously saved records from browser Local Storage.
// This function loads saved information from the browser and fills in any missing default values. 
function loadData(){
    try {
        const raw=JSON.parse(localStorage.getItem(STORAGE_KEY));
        return {
            ...defaultData(),
            ...(raw||{}),
            recurring:Array.isArray(raw?.recurring)?raw.recurring:[],
            plannedPayments:Array.isArray(raw?.plannedPayments)?raw.plannedPayments:[],
            customCategories:Array.isArray(raw?.customCategories)?raw.customCategories:[],
            settings:{...defaultData().settings,...(raw?.settings||{})},
            planner:{...defaultData().planner,...(raw?.planner||{})}
        };
    }
    catch(e){
        return defaultData();
    }
}

// Shared data: Holds records used by the Dashboard, Budget, Savings, Debt, and Calendar pages.
let data=loadData();

// Persist the shared data object in this browser. This is local storage, not a bank connection.
// Stores the latest shared records in browser Local Storage.
// This function saves the current Wealthness information in the browser. 
function save(){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}

// This function finds a page element using its ID. 
function byId(id){
    return document.getElementById(id);
}

// This function gets the text entered in a form field. 
function val(id){
    return byId(id)?.value?.trim() ?? "";
}

// This function changes the text shown inside a page element. 
function setText(id,text){
    if(byId(id))byId(id).textContent=text;
}

// This function gets the year and month from a date. 
function monthKey(date){
    return String(date||"").slice(0,7);
}

// This function gets the current month. 
function currentMonth(){
    return todayISO().slice(0,7);
}

// Reuse one month filter so dashboard totals, insights, and health summaries agree.
// This function gets the transactions recorded for the current month. 
function monthTransactions(){
    return data.transactions.filter(t=>monthKey(t.date)===currentMonth());
}

// This function adds together values from a list. 
function sum(items,fn){
    return items.reduce((a,x)=>a+(Number(fn(x))||0),0);
}

// This function calculates the total income and expenses. 
function totals(items){
    return {
        income:sum(items,t=>t.type==="income"?t.amount:0),
        expense:sum(items,t=>t.type==="expense"?t.amount:0)
    };
}

// This function calculates the balance by subtracting expenses from income. 
function availableBalance(){
    const t=totals(data.transactions);
    return t.income-t.expense;
}

// This function gets a transaction category or uses Others when none is set. 
function categoryName(t){
    return t.category||"Others";
}

// This function combines the default categories with any custom categories. 
function allCategories(){
    return [...new Set(["Food","Housing","Transportation","Education","Bills","Personal","Salary","Allowance","Others",...(data.customCategories||[])])];
}

// This function fills the category menus used by the forms. 
function populateCategoryOptions(){
    ["transaction-category","recurring-category","planned-category"].forEach(id=>{
        const select=byId(id);
        if(!select)return;
        const current=select.value;
        select.innerHTML=allCategories().map(cat=>`<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`).join("");
        if(allCategories().includes(current))select.value=current;
    });
}

// This function formats a date using the user's local year, month, and day. 
function formatLocalDate(date){
    const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
}

// This function turns a saved date into a local date value. 
function parseLocalDate(value){
    const [y,m,d]=String(value||"").split("-").map(Number);
    return y&&m&&d?new Date(y,m-1,d):null;
}

// This function moves a recurring date forward based on its schedule. 
function advanceDate(value,frequency){
    const date=parseLocalDate(value);
    if(!date)return value;
    if(frequency==="weekly")date.setDate(date.getDate()+7);
    else if(frequency==="yearly")date.setFullYear(date.getFullYear()+1);
    else date.setMonth(date.getMonth()+1);
    return formatLocalDate(date);
}

// When a recurring date arrives, create its transaction and move its next date forward.
// This function adds recurring transactions when they are due and updates their next dates. 
function processRecurringTransactions(){
    let changed=false;
    const today=todayISO();
    (data.recurring||[]).forEach(item=>{
        let runs=0;
        while(item.nextDate&&item.nextDate<=today&&runs<36){
            data.transactions.push({
                id:uid(),
                date:item.nextDate,
                type:item.type,
                description:item.description,
                category:item.category||"Others",
                amount:Number(item.amount)||0,
                source:"Recurring",
                recurringId:item.id
            });
            item.nextDate=advanceDate(item.nextDate,item.frequency||"monthly");
            runs++;
            changed=true;
        }
    });
    if(changed)save();
}

// This function shows the recurring transactions on the page. 
function renderRecurring(){
    const el=byId("recurring-list");
    if(!el)return;
    el.innerHTML=data.recurring.length?data.recurring.map(item=>`
        <div class="category-row recurring-row">
            <span class="category-name">${escapeHTML(item.description)}</span>
            <span class="category-amount">${money(item.amount)} · ${escapeHTML(item.frequency)}</span>
            <span class="goal-meta">Next: ${escapeHTML(item.nextDate||"Not scheduled")} · ${escapeHTML(item.category||"Others")}</span>
            <div><button class="btn btn-danger btn-small" data-delete-recurring="${item.id}">Remove</button></div>
        </div>`).join(""):`<div class="empty-state">No recurring entries yet. Add regular income or expenses to save time.</div>`;
}

// The calendar combines planned payments, debt due dates, and recurring entries.
// Displays upcoming and recorded financial dates.
// This function shows planned payments, debt due dates, and recurring entries in the calendar. 
function renderCalendar(){
    const el=byId("calendar-events");
    if(!el)return;
    const today=todayISO();
    const events=[
        ...(data.plannedPayments||[]).map(item=>({id:item.id,kind:"planned",date:item.date,title:item.name,amount:item.amount,type:item.type||"expense",category:item.category||"Bills"})),
        ...(data.debts||[]).filter(item=>item.due&&Number(item.remaining)>0).map(item=>({id:item.id,kind:"debt",date:item.due,title:item.name,amount:item.remaining,type:"expense",category:"Debt"})),
        ...(data.recurring||[]).filter(item=>item.nextDate).map(item=>({id:item.id,kind:"recurring",date:item.nextDate,title:item.description,amount:item.amount,type:item.type,category:item.category||"Others"}))
    ].sort((a,b)=>a.date.localeCompare(b.date));
    const upcoming=events.filter(event=>event.date>=today&&event.type==="expense");
    const overdue=events.filter(event=>event.date<today);
    setText("upcoming-count",String(events.filter(event=>event.date>=today).length));
    setText("upcoming-total",money(sum(upcoming,event=>event.amount)));
    setText("overdue-count",String(overdue.length));
    el.innerHTML=events.length?events.map(event=>{
        const status=event.date<today?"Overdue":event.date===today?"Due today":"Upcoming";
        const kindLabel=event.kind==="debt"?"Debt due":event.kind==="recurring"?"Recurring":"Planned";
        return `<article class="calendar-event">
            <div class="calendar-date"><strong>${escapeHTML(event.date)}</strong><span>${status}</span></div>
            <div class="calendar-detail"><strong>${escapeHTML(event.title)}</strong><span>${escapeHTML(kindLabel)} · ${escapeHTML(event.category)}</span></div>
            <div class="calendar-amount ${event.type==="income"?"amount-income":"amount-expense"}">${event.type==="income"?"+":"−"}${money(event.amount)}</div>
            ${event.kind==="planned"?`<button class="btn btn-danger btn-small" data-delete-planned="${event.id}">Remove</button>`:""}
        </article>`;
    }).join(""):`<div class="empty-state">Nothing scheduled yet. Add a planned payment or record a debt due date.</div>`;
}

// This function creates spending insights from the user's transactions. 
function renderInsights(){
    const el=byId("spending-insights");
    if(!el)return;
    const now=new Date(),previous=new Date(now.getFullYear(),now.getMonth()-1,1);
    const previousKey=`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2,"0")}`;
    const previousExpenses=sum(data.transactions.filter(t=>monthKey(t.date)===previousKey&&t.type==="expense"),t=>t.amount);
    const current=totals(monthTransactions());
    const groups={};
    monthTransactions().filter(t=>t.type==="expense").forEach(t=>groups[categoryName(t)]=(groups[categoryName(t)]||0)+Number(t.amount));
    const top=Object.entries(groups).sort((a,b)=>b[1]-a[1])[0];
    const rate=current.income?Math.round((current.income-current.expense)/current.income*100):0;
    const change=previousExpenses?Math.round((current.expense-previousExpenses)/previousExpenses*100):null;
    const changeText=change===null?"No spending recorded last month":`${Math.abs(change)}% ${change>0?"higher":change<0?"lower":"unchanged"} than last month`;
    el.innerHTML=`
        <article class="stat-card"><div class="stat-label">Savings rate this month</div><div class="stat-value">${current.income?`${rate}%`:"—"}</div><div class="stat-note">Based on recorded income and expenses</div></article>
        <article class="stat-card"><div class="stat-label">Top spending category</div><div class="stat-value insight-category">${top?escapeHTML(top[0]):"—"}</div><div class="stat-note">${top?money(top[1])+" spent this month":"Add expenses to see an insight"}</div></article>
        <article class="stat-card"><div class="stat-label">Spending comparison</div><div class="stat-value">${money(current.expense)}</div><div class="stat-note">${changeText}</div></article>`;
}

// This function shows a short message on the page. 
function toast(message){
    const el=byId("toast");
    if(!el)return;
    el.textContent=message;
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>el.classList.add("hidden"),2800);
}

// Dashboard reads the shared records and refreshes its totals, chart, spending, and goals.
// Displays the user's balance, income, expenses, and financial overview.
// This function updates the Dashboard totals and financial summary. 
function renderOverview(){
    const all=totals(data.transactions),m=totals(monthTransactions());

    setText("available-balance",money(all.income-all.expense));
    setText("monthly-income",money(m.income));
    setText("monthly-spending",money(m.expense));
    setText("total-saved",money(sum(data.goals,g=>g.saved)));
    setText("current-date",new Date().toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"}));

    const recent=[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
    const tbody=byId("recent-transactions");

    if(tbody)tbody.innerHTML=recent.length?recent.map(t=>`<tr><td>${escapeHTML(t.date)}</td><td>${escapeHTML(t.description)}</td><td>${escapeHTML(categoryName(t))}</td><td><span class="pill ${t.type==="income"?"":"neutral"}">${t.type}</span></td><td class="${t.type==="income"?"amount-income":"amount-expense"}">${t.type==="income"?"+":"−"}${money(t.amount)}</td></tr>`).join(""):`<tr><td colspan="5"><div class="empty-state">No transactions yet. Add your first entry in Budget & Expenses.</div></td></tr>`;

    renderChart();
    renderSpending();
    renderOverviewGoals();

    const planned=Number(data.planner.rate??20);
    const income=Number(data.planner.income)||m.income;
    setText("overview-saving-suggestion",money(income*planned/100));
}

// Build six local calendar months; matching YYYY-MM keys avoids UTC month shifts.
// This function draws the income and expense chart for recent months. 
function renderChart(){
    const el=byId("cashflow-chart");
    if(!el)return;

    const now=new Date(),months=[];

    for(let i=5;i>=0;i--){
        const d=new Date(now.getFullYear(),now.getMonth()-i,1);
        const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        const tx=data.transactions.filter(t=>monthKey(t.date)===key);
        const t=totals(tx);
        months.push({label:d.toLocaleDateString("en",{month:"short"}),...t});
    }

    const max=Math.max(1,...months.flatMap(m=>[m.income,m.expense]));

    el.innerHTML=months.map(m=>`<div class="chart-month"><div class="chart-bars"><div class="chart-bar" title="Income ${money(m.income)}" style="height:${Math.max(3,m.income/max*100)}%"></div><div class="chart-bar expense" title="Expenses ${money(m.expense)}" style="height:${Math.max(3,m.expense/max*100)}%"></div></div><span class="chart-label">${m.label}</span></div>`).join("");
}

// This function shows how spending is divided by category. 
function renderSpending(){
    const el=byId("spending-overview");
    if(!el)return;

    const expenses=monthTransactions().filter(t=>t.type==="expense");
    const total=sum(expenses,t=>t.amount);
    const groups={};

    expenses.forEach(t=>groups[categoryName(t)]=(groups[categoryName(t)]||0)+Number(t.amount));

    const sorted=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,5);

    el.innerHTML=sorted.length?sorted.map(([name,amount])=>`<div class="category-row"><span class="category-name">${escapeHTML(name)}</span><span class="category-amount">${money(amount)}</span><div class="progress-track"><div class="progress-fill" style="width:${total?amount/total*100:0}%"></div></div></div>`).join(""):`<div class="empty-state">Your spending categories will appear here once you add expenses.</div>`;
}

// This function shows savings goal progress on the Dashboard. 
function renderOverviewGoals(){
    const el=byId("savings-overview");
    if(!el)return;

    const goals=data.goals.slice(0,3);

    el.innerHTML=goals.length?goals.map(g=>`<div class="category-row"><span class="category-name">${escapeHTML(g.name)}</span><span class="category-amount">${Math.min(100,Math.round(g.saved/Math.max(1,g.target)*100))}%</span><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,g.saved/Math.max(1,g.target)*100)}%"></div></div></div>`).join(""):`<div class="empty-state">Create a savings goal to start tracking your progress.</div>`;
}

// Budget page lists the same transactions used by the dashboard and health overview.
// Displays transactions, spending limits, and expense summaries.
// This function shows the user's transactions in the Budget page. 
function renderBudget(){
    const list=byId("transaction-list");
    if(!list)return;

    const search=(val("budget-search")||"").toLowerCase(),type=val("type-filter");

    const filtered=[...data.transactions].filter(t=>(!type||t.type===type)&&(`${t.description} ${t.category} ${t.date}`.toLowerCase().includes(search))).sort((a,b)=>b.date.localeCompare(a.date));

    list.innerHTML=filtered.length?filtered.map(t=>`<tr><td>${escapeHTML(t.date)}</td><td>${escapeHTML(t.description)}</td><td>${escapeHTML(categoryName(t))}</td><td><span class="pill ${t.type==="income"?"":"neutral"}">${t.type}</span></td><td class="${t.type==="income"?"amount-income":"amount-expense"}">${t.type==="income"?"+":"−"}${money(t.amount)}</td><td><button class="btn btn-secondary btn-small" data-edit-tx="${t.id}">Edit</button> <button class="btn btn-danger btn-small" data-delete-tx="${t.id}">Delete</button></td></tr>`).join(""):`<tr><td colspan="6"><div class="empty-state">No matching transactions found.</div></td></tr>`;

    const m=totals(monthTransactions());
    setText("transaction-count",String(data.transactions.length));
    setText("budget-income-total",money(m.income));
    setText("budget-expense-total",money(m.expense));
    setText("budget-balance-total",money(m.income-m.expense));

    renderBudgets();
}

// This function shows the current budget limits and spending. 
function renderBudgets(){
    const el=byId("budget-limits");
    if(!el)return;

    const categories=allCategories();

    el.innerHTML=categories.map(cat=>{
        const limit=Number(data.budgets[cat])||0;
        const spent=sum(monthTransactions().filter(t=>t.type==="expense"&&t.category===cat),t=>t.amount);
        const pct=limit?Math.min(100,spent/limit*100):0;
        return `<div class="category-row"><span class="category-name">${escapeHTML(cat)}</span><span class="category-amount">${money(spent)} / ${limit?money(limit):"No limit"}</span><div class="progress-track"><div class="progress-fill ${pct>=100?"danger":pct>=80?"warning":""}" style="width:${pct}%"></div></div><div style="grid-column:1/-1"><button class="btn btn-secondary btn-small" data-budget="${escapeHTML(cat)}">Set limit</button></div></div>`
    }).join("");
}

// This function clears the transaction form after it is used. 
function resetTransactionForm(){
    const f=byId("transaction-form");
    if(!f)return;
    f.reset();
    byId("transaction-id").value="";
    byId("transaction-date").value=todayISO();
    setText("form-heading","Add a transaction");
    setText("save-entry-button","Save transaction");
    byId("cancel-edit-button")?.classList.add("hidden");
}

// This function checks the transaction form and saves the new or edited transaction. 
function handleTransactionSubmit(e){
    e.preventDefault();

    const id=val("transaction-id"),type=val("transaction-type"),description=val("transaction-description"),category=val("transaction-category"),amount=Number(val("transaction-amount")),date=val("transaction-date");

    if(!description||description.length>120||!category||category.length>60||!date||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!Number.isFinite(amount)||amount<=0||amount>1000000000||!["income","expense"].includes(type)){
        toast("Please enter valid details. Amount must be above 0 and below 1 billion.");
        return;
    }

    const item={id:id||uid(),type,description,category,amount,date};

    if(id){
        data.transactions=data.transactions.map(t=>t.id===id?item:t)
    }else data.transactions.push(item);

    save();
    resetTransactionForm();
    refresh();

    const modal=byId("quick-entry-modal");
    if(modal){
        modal.classList.add("hidden");
        document.body.classList.remove("modal-open")
    }

    toast(id?"Transaction updated.":"Transaction saved.");
}

// This function loads a selected transaction into the form so it can be changed. 
function editTransaction(id){
    const t=data.transactions.find(x=>x.id===id);
    if(!t)return;

    byId("transaction-id").value=t.id;
    byId("transaction-type").value=t.type;
    byId("transaction-description").value=t.description;
    byId("transaction-category").value=t.category;
    byId("transaction-amount").value=t.amount;
    byId("transaction-date").value=t.date;
    setText("form-heading","Edit transaction");
    setText("save-entry-button","Update transaction");
    byId("cancel-edit-button")?.classList.remove("hidden");
    byId("transaction-form").scrollIntoView({behavior:"smooth",block:"center"})
}

// Savings goals are shared with the dashboard and Financial Health summary.
// Displays goals, saved amounts, and progress toward each target.
// This function shows savings goals and their progress. 
function renderSavings(){
    const el=byId("goals-list");
    if(!el)return;

    el.innerHTML=data.goals.length?data.goals.map(g=>{
        const pct=Math.min(100,g.saved/Math.max(1,g.target)*100);
        return `<article class="goal-card"><div class="goal-top"><div class="goal-emoji">${escapeHTML(g.emoji||"🎯")}</div><span class="pill">${Math.round(pct)}% complete</span></div><h3 style="margin-top:12px">${escapeHTML(g.name)}</h3><div class="goal-amount">${money(g.saved)} <span style="font-size:11px;color:var(--muted);font-weight:500">of ${money(g.target)}</span></div><div class="goal-progress"><span style="width:${pct}%"></span></div><div class="goal-meta">${money(Math.max(0,g.target-g.saved))} remaining</div><div class="goal-actions"><button class="btn btn-primary btn-small" data-add-goal="${g.id}">Add savings</button><button class="btn btn-secondary btn-small" data-edit-goal="${g.id}">Edit</button><button class="btn btn-danger btn-small" data-delete-goal="${g.id}">Delete</button></div></article>`
    }).join(""):`<div class="empty-state" style="grid-column:1/-1">No savings goals yet. Create your first goal above.</div>`;

    updatePlanner();
}

// Calculator estimates use entered values or recorded income/essential expenses as defaults.
// This function calculates the planner amounts using entered values or saved financial records. 
function updatePlanner(){
    const income=Number(data.planner.income)||totals(monthTransactions()).income;
    const essential=Number(data.planner.essential)||sum(monthTransactions().filter(t=>t.type==="expense"&&["Housing","Food","Transportation","Education","Bills"].includes(t.category)),t=>t.amount);
    const debt=sum(data.debts,d=>Number(d.remaining)||0);
    const rate=Number(data.planner.rate??20),suggested=income*rate/100,remaining=income-essential-suggested;

    setText("planner-suggested",money(suggested));
    setText("planner-suggested-copy",money(suggested));
    setText("planner-income-display",money(income));
    setText("planner-expense-display",money(essential));
    setText("planner-remaining",money(remaining));

    const target=Number(data.planner.goal)||0,months=Math.max(1,Number(data.planner.months)||12);

    setText("planner-monthly-goal",money(target/months));
    setText("emergency-target-low",money(essential*3));
    setText("emergency-target-high",money(essential*6));
    setText("planner-debt-total",money(debt));
}

// Debt balances feed the debt page, planner summary, health overview, and calendar due dates.
// Displays recorded debts and their remaining balances.
// This function shows the user's debts and remaining balances. 
function renderDebt(){
    const el=byId("debt-list");
    if(!el)return;

    el.innerHTML=data.debts.length?data.debts.map(d=>{
        const pct=d.original?Math.min(100,(d.original-d.remaining)/d.original*100):0;
        return `<div class="goal-card"><div class="goal-top"><div><h3>${escapeHTML(d.name)}</h3><div class="goal-meta">${escapeHTML(d.due||"No due date")} · ${escapeHTML(d.type||"Debt")}</div></div><span class="pill ${d.remaining===0?"":"warning"}">${d.remaining===0?"Paid":"In progress"}</span></div><div class="goal-amount">${money(d.remaining)} <span style="font-size:11px;color:var(--muted);font-weight:500">remaining of ${money(d.original)}</span></div><div class="goal-progress"><span style="width:${pct}%"></span></div><div class="goal-meta">${Math.round(pct)}% repaid</div><div class="goal-actions"><button class="btn btn-primary btn-small" data-pay-debt="${d.id}" ${d.remaining<=0?"disabled":""}>Record payment</button><button class="btn btn-secondary btn-small" data-edit-debt="${d.id}">Edit</button><button class="btn btn-danger btn-small" data-delete-debt="${d.id}">Delete</button></div></div>`
    }).join(""):`<div class="empty-state" style="grid-column:1/-1">No debts recorded. Add a debt to monitor repayment progress.</div>`;

    setText("debt-total",money(sum(data.debts,d=>d.remaining)));
}

// After a change, redraw every page section that may depend on the shared data.
// Re-renders page sections that depend on shared financial data.
// This function updates the page sections that use the shared financial information. 
function refresh(){
    renderOverview();
    renderBudget();
    renderSavings();
    renderDebt();
    renderSettings();
    renderRecurring();
    renderCalendar();
    renderInsights();
    renderHealth();
    renderChallenge();
}

// Displays user preferences and data backup options.
// This function shows the saved account information and settings. 
function renderSettings(){
    const el=byId("accounts-list");
    if(!el)return;

    el.innerHTML=data.accounts.length?data.accounts.map(a=>`<div class="account-card"><div class="account-left"><div class="account-logo">${escapeHTML(a.provider.slice(0,2).toUpperCase())}</div><div><strong>${escapeHTML(a.label)}</strong><div class="goal-meta">${escapeHTML(a.provider)} · ${escapeHTML(a.status)}</div></div></div><button class="btn btn-danger btn-small" data-disconnect="${a.id}">Remove</button></div>`).join(""):`<div class="empty-state">No accounts added yet. You can add a demo account below.</div>`;

    if(byId("profile-name"))byId("profile-name").value=data.settings.name||"";
}


// This function loads the saved theme and updates the theme buttons. 
function initTheme(){
 const saved=localStorage.getItem("wealthnessTheme");
 if(saved==="dark")document.body.classList.add("dark-mode");
 const update=()=>{const dark=document.body.classList.contains("dark-mode");document.querySelectorAll("#theme-toggle").forEach(b=>{b.innerHTML=dark?'☀ <span>Light mode</span>':'☾ <span>Dark mode</span>';b.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode")})};
 const toggle=()=>{document.body.classList.toggle("dark-mode");localStorage.setItem("wealthnessTheme",document.body.classList.contains("dark-mode")?"dark":"light");update()};
 document.querySelectorAll("#theme-toggle").forEach(b=>b.addEventListener("click",toggle));
 byId("settings-theme-toggle")?.addEventListener("click",toggle);update();
}
// This is an educational estimate calculated from saved transactions, budgets, goals, and debts.
// Estimates financial status using saved income, expenses, savings, and debts.
// This function calculates and displays an estimated financial health summary. 
function renderHealth(){
 if(!byId("health-stats"))return;
 const m=totals(monthTransactions()),all=totals(data.transactions),saved=sum(data.goals,g=>g.saved),targets=sum(data.goals,g=>g.target);
 const debtOriginal=sum(data.debts,d=>d.original),debtRemaining=sum(data.debts,d=>d.remaining),budgetTotal=sum(Object.values(data.budgets),v=>v);
 const hasRecords=Boolean(data.transactions.length||data.goals.length||data.debts.length);
 const score=(m.income>0&&m.expense<=m.income?30:0)+(budgetTotal>0?(m.expense<=budgetTotal?25:8):0)+(targets>0?Math.round(Math.min(1,saved/targets)*25):0)+(debtOriginal>0?Math.round(Math.max(0,1-debtRemaining/debtOriginal)*20):(data.debts.length?0:20));
 const label=!hasRecords?"Add records to see an estimate":score>=80?"Good habits":score>=55?"Making progress":score>=30?"Room to improve":"Start with small steps";
 byId("health-stats").innerHTML=`<article class="stat-card"><div class="stat-label">Estimated health score</div><div class="stat-value">${hasRecords?score+"/100":"—"}</div><div class="stat-note">${label}</div></article><article class="stat-card"><div class="stat-label">This month's income</div><div class="stat-value">${money(m.income)}</div><div class="stat-note">Recorded income</div></article><article class="stat-card"><div class="stat-label">This month's expenses</div><div class="stat-value">${money(m.expense)}</div><div class="stat-note">${m.income?money(m.income-m.expense)+" remaining":"Add income to compare"}</div></article><article class="stat-card"><div class="stat-label">Total savings recorded</div><div class="stat-value">${money(saved)}</div><div class="stat-note">Across ${data.goals.length} goal(s)</div></article>`;
 byId("health-cashflow").innerHTML=`<div class="category-row"><span>Income</span><strong class="amount-income">${money(m.income)}</strong><span>Expenses</span><strong class="amount-expense">${money(m.expense)}</strong></div><div class="result-box" style="margin-top:14px"><small>Net cash flow</small><strong>${money(m.income-m.expense)}</strong></div>`;
 byId("health-savings").innerHTML=data.goals.length?data.goals.map(g=>{const pct=Math.min(100,Number(g.saved)/Math.max(1,Number(g.target))*100);return `<div class="category-row"><span>${escapeHTML(g.name)}</span><strong>${Math.round(pct)}%</strong><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`}).join(""):'<div class="empty-state">Create a savings goal to see progress here.</div>';
 byId("health-debt").innerHTML=data.debts.length?`<div class="stat-value">${money(debtRemaining)}</div><p class="panel-subtitle">Remaining across ${data.debts.length} recorded debt(s), from an original ${money(debtOriginal)}.</p>`:'<div class="empty-state">No debt records added.</div>';
 byId("health-summary").innerHTML=`<div class="category-row"><span>All-time recorded income</span><strong>${money(all.income)}</strong><span>All-time recorded expenses</span><strong>${money(all.expense)}</strong><span>Budget limits set</span><strong>${money(budgetTotal)}</strong></div>`;
 const tips=[];if(!data.transactions.length)tips.push("Add income and expenses in Budget & Expenses to make your summary more useful.");else if(m.income&&m.expense>m.income)tips.push("Recorded expenses are higher than this month's income. Review flexible spending and upcoming payments.");else if(m.income&&!budgetTotal)tips.push("Consider setting monthly category limits in Budget & Expenses.");if(!data.goals.length)tips.push("Create a small, realistic savings goal.");else if(saved<targets)tips.push("Keep your savings goal manageable and contribute when your budget allows.");if(data.debts.some(d=>d.remaining>0))tips.push("Review debt due dates in Debt Management and Financial Calendar.");if(!tips.length)tips.push("Keep recording transactions regularly so your overview stays useful.");
 byId("health-tips").innerHTML=tips.map(t=>`<div class="health-tip">${escapeHTML(t)}</div>`).join("");
}
// Calculators display estimates only; they do not change saved transactions or goal balances.
// Estimates savings, emergency funds, and budget plans without changing saved records.
// This function sets up the savings, emergency fund, and budget calculators. 
function initCalculators(){
 byId("savings-calc-form")?.addEventListener("submit",e=>{e.preventDefault();const target=Number(val("calc-target")),current=Number(val("calc-current"))||0,months=Number(val("calc-months"));if(target<=0||months<=0){toast("Enter valid goal details.");return}byId("savings-calc-result").innerHTML=`<small>Estimated amount to save each month</small><strong>${money(Math.max(0,target-current)/months)}</strong><p class="panel-subtitle">${money(Math.max(0,target-current))} remaining over ${months} month(s).</p>`});
 byId("emergency-calc-form")?.addEventListener("submit",e=>{e.preventDefault();const expenses=Number(val("calc-essentials")),months=Number(val("calc-emergency-months"));if(expenses<0){toast("Enter a valid expense amount.");return}byId("emergency-calc-result").innerHTML=`<small>Estimated emergency fund target</small><strong>${money(expenses*months)}</strong><p class="panel-subtitle">Based on ${months} month(s) of essential expenses.</p>`});
 byId("budget-calc-form")?.addEventListener("submit",e=>{e.preventDefault();const income=Number(val("calc-income")),rate=Number(val("calc-save-rate"));if(income<0||rate<0||rate>100){toast("Enter valid income and savings percentage.");return}const savings=income*rate/100;byId("budget-calc-result").innerHTML=`<article class="stat-card"><div class="stat-label">Suggested savings</div><div class="stat-value">${money(savings)}</div></article><article class="stat-card"><div class="stat-label">Remaining for expenses</div><div class="stat-value">${money(income-savings)}</div></article>`});
}
// Challenge check-ins are stored with the same shared data and survive page reloads.
// Displays the selected challenge and saved daily check-ins.
// This function shows the active savings challenge and its check-in progress. 
function renderChallenge(){
 const el=byId("challenge-progress");if(!el)return;const active=data.challengeState;
 if(!active){el.innerHTML='<div class="empty-state">You have not started a challenge yet. Choose one above to begin.</div>';return}
 const total=Number(active.total)||7,done=(active.days||[]).length,pct=Math.min(100,done/total*100);
 el.innerHTML=`<h3>${total}-Day ${total===7?"Starter":"Consistency"} Challenge</h3><p class="panel-subtitle">${done} of ${total} daily check-ins completed.</p><div class="challenge-progress-track"><div class="challenge-progress-fill" style="width:${pct}%"></div></div><p class="panel-subtitle">${Math.round(pct)}% complete</p><button class="btn btn-primary" id="challenge-checkin" type="button" ${done>=total?"disabled":""}>Mark today's check-in</button> <button class="btn btn-secondary" id="challenge-reset" type="button">Reset challenge</button>`;
}

// Set up only the controls present on the current page, then render from shared local data.
// Connects controls on the current page and starts the required rendering functions.
// This function connects the forms and buttons on the current page, then displays its information. 
function initPage(){
    const page=document.body.dataset.page;
    initTheme();

    populateCategoryOptions();
    processRecurringTransactions();
    renderHealth();
    initCalculators();
    renderChallenge();

    if(byId("transaction-date"))byId("transaction-date").value=todayISO();
    if(byId("planner-income"))byId("planner-income").value=data.planner.income||"";
    if(byId("planner-essential"))byId("planner-essential").value=data.planner.essential||"";
    if(byId("planner-rate"))byId("planner-rate").value=data.planner.rate??20;
    if(byId("planner-goal"))byId("planner-goal").value=data.planner.goal||"";
    if(byId("planner-months"))byId("planner-months").value=data.planner.months||12;

    if(byId("transaction-form"))byId("transaction-form").addEventListener("submit",handleTransactionSubmit);

    const guideModal=byId("user-guide-modal");
    const closeGuide=()=>{guideModal?.classList.add("hidden");document.body.classList.remove("modal-open")};
    byId("open-user-guide")?.addEventListener("click",()=>{guideModal?.classList.remove("hidden");document.body.classList.add("modal-open");byId("close-user-guide")?.focus()});
    byId("close-user-guide")?.addEventListener("click",closeGuide);
    byId("finish-user-guide")?.addEventListener("click",closeGuide);
    guideModal?.addEventListener("click",e=>{if(e.target===guideModal)closeGuide()});

    const quickModal=byId("quick-entry-modal");
    const closeQuickModal=()=>{
        quickModal?.classList.add("hidden");
        document.body.classList.remove("modal-open")
    };

    byId("open-add-entry")?.addEventListener("click",()=>{
        quickModal?.classList.remove("hidden");
        document.body.classList.add("modal-open");
        byId("transaction-date").value=todayISO();
        byId("transaction-description").focus()
    });

    byId("close-add-entry")?.addEventListener("click",closeQuickModal);
    byId("cancel-quick-entry")?.addEventListener("click",closeQuickModal);
    quickModal?.addEventListener("click",e=>{
        if(e.target===quickModal)closeQuickModal()
    });
    document.addEventListener("keydown",e=>{
        if(e.key==="Escape")closeQuickModal()
    });

    byId("cancel-edit-button")?.addEventListener("click",resetTransactionForm);
    byId("budget-search")?.addEventListener("input",renderBudget);
    byId("type-filter")?.addEventListener("change",renderBudget);

    byId("custom-category-form")?.addEventListener("submit",e=>{
        e.preventDefault();
        const category=val("custom-category-input");
        if(!category){
            toast("Enter a category name.");
            return;
        }
        if(allCategories().some(item=>item.toLowerCase()===category.toLowerCase())){
            toast("That category already exists.");
            return;
        }
        data.customCategories.push(category);
        save();
        e.target.reset();
        populateCategoryOptions();
        renderBudgets();
        toast("Custom category added.");
    });

    byId("recurring-form")?.addEventListener("submit",e=>{
        e.preventDefault();
        const description=val("recurring-description");
        const amount=Number(val("recurring-amount"));
        const nextDate=val("recurring-next-date");
        if(!description||!nextDate||!Number.isFinite(amount)||amount<=0){
            toast("Enter a description, valid amount, and next date.");
            return;
        }
        data.recurring.push({
            id:uid(),
            description,
            amount,
            type:val("recurring-type"),
            category:val("recurring-category")||"Others",
            frequency:val("recurring-frequency")||"monthly",
            nextDate
        });
        save();
        e.target.reset();
        if(byId("recurring-next-date"))byId("recurring-next-date").value=todayISO();
        refresh();
        toast("Recurring entry saved.");
    });

    byId("planned-form")?.addEventListener("submit",e=>{
        e.preventDefault();
        const name=val("planned-name"),amount=Number(val("planned-amount")),date=val("planned-date");
        if(!name||!date||!Number.isFinite(amount)||amount<=0){
            toast("Enter a description, valid amount, and date.");
            return;
        }
        data.plannedPayments.push({
            id:uid(),name,amount,date,
            category:val("planned-category")||"Bills",
            type:val("planned-type")||"expense"
        });
        save();
        e.target.reset();
        refresh();
        toast("Planned payment added to your calendar.");
    });

    byId("goal-form")?.addEventListener("submit",e=>{
        e.preventDefault();
        const name=val("goal-name"),target=Number(val("goal-target"));

        if(!name||target<=0){
            toast("Enter a goal name and valid target.");
            return
        }

        data.goals.push({id:uid(),name,target,saved:0,emoji:val("goal-emoji")||"🎯"});
        save();
        e.target.reset();
        refresh();
        toast("Savings goal created.")
    });

    byId("planner-form")?.addEventListener("input",()=>{
        data.planner={
            income:val("planner-income"),
            essential:val("planner-essential"),
            rate:Number(val("planner-rate"))||0,
            goal:val("planner-goal"),
            months:Number(val("planner-months"))||12
        };
        save();
        setText("planner-rate-value",(Number(val("planner-rate"))||0)+"%");
        updatePlanner()
    });

    byId("debt-form")?.addEventListener("submit",e=>{
        e.preventDefault();
        const name=val("debt-name"),original=Number(val("debt-amount"));

        if(!name||original<=0){
            toast("Enter a debt name and valid amount.");
            return
        }

        data.debts.push({id:uid(),name,original,remaining:original,due:val("debt-due"),type:val("debt-type")||"Personal"});
        save();
        e.target.reset();
        refresh();
        toast("Debt added.")
    });

    byId("account-form")?.addEventListener("submit",e=>{
        e.preventDefault();
        const provider=val("account-provider"),label=val("account-label");

        if(!provider||!label){
            toast("Choose a provider and enter an account label.");
            return
        }

        data.accounts.push({id:uid(),provider,label,status:"Demo connected"});
        save();
        e.target.reset();
        refresh();
        toast("Demo account added. No live connection was made.")
    });

    byId("profile-form")?.addEventListener("submit",e=>{
        e.preventDefault();
        data.settings.name=val("profile-name");
        save();
        toast("Settings saved.")
    });

    document.addEventListener("click",e=>{
        const b=e.target.closest("button");
        if(!b)return;

        if(b.dataset.editTx)editTransaction(b.dataset.editTx);
        if(b.dataset.challenge){data.challengeState={total:Number(b.dataset.challenge),days:[]};save();renderChallenge();toast("Savings challenge started.");}
        if(b.id==="challenge-checkin"){const today=todayISO(),days=data.challengeState?.days||[];if(!days.includes(today)){days.push(today);data.challengeState.days=days;save();renderChallenge();toast("Today's check-in saved.");}else toast("You already checked in today.");}
        if(b.id==="challenge-reset"&&confirm("Reset your current challenge?")){data.challengeState=null;save();renderChallenge();toast("Challenge reset.");}

        if(b.dataset.deleteRecurring){
            data.recurring=data.recurring.filter(item=>item.id!==b.dataset.deleteRecurring);
            save();
            refresh();
            toast("Recurring entry removed.");
        }

        if(b.dataset.deletePlanned){
            data.plannedPayments=data.plannedPayments.filter(item=>item.id!==b.dataset.deletePlanned);
            save();
            refresh();
            toast("Planned payment removed.");
        }

        if(b.dataset.deleteTx&&confirm("Delete this transaction?")){
            data.transactions=data.transactions.filter(t=>t.id!==b.dataset.deleteTx);
            save();
            refresh();
            toast("Transaction deleted.")
        }

        if(b.dataset.budget){
            const cat=b.dataset.budget;
            const current=data.budgets[cat]||"";
            const answer=prompt(`Monthly spending limit for ${cat} (₱):`,current);

            if(answer!==null){
                const n=Number(answer);
                if(!Number.isFinite(n)||n<0){
                    toast("Enter a valid limit.");
                    return
                }
                data.budgets[cat]=n;
                save();
                renderBudget();
            }
        }

        if(b.dataset.addGoal){
            const g=data.goals.find(x=>x.id===b.dataset.addGoal);
            const amount=Number(prompt(`How much would you like to add to ${g.name}? (₱)`));

            if(amount>0){
                g.saved+=amount;
                save();
                refresh();
                toast("Savings contribution added.")
            }
        }

        if(b.dataset.editGoal){
            const g=data.goals.find(x=>x.id===b.dataset.editGoal);
            const name=prompt("Goal name:",g.name);
            if(name===null)return;

            const target=Number(prompt("Target amount (₱):",g.target));

            if(name.trim()&&target>0){
                g.name=name.trim();
                g.target=target;
                save();
                refresh();
            }
        }

        if(b.dataset.deleteGoal&&confirm("Delete this savings goal?")){
            data.goals=data.goals.filter(g=>g.id!==b.dataset.deleteGoal);
            save();
            refresh();
        }

        if(b.dataset.payDebt){
            const d=data.debts.find(x=>x.id===b.dataset.payDebt);
            const amount=Number(prompt(`Payment amount for ${d.name} (₱):`));

            if(amount>0){
                d.remaining=Math.max(0,d.remaining-amount);
                save();
                refresh();
                toast("Debt payment recorded.")
            }
        }

        if(b.dataset.editDebt){
            const d=data.debts.find(x=>x.id===b.dataset.editDebt);
            const name=prompt("Debt name:",d.name);

            if(name!==null&&name.trim()){
                d.name=name.trim();
                save();
                refresh();
            }
        }

        if(b.dataset.deleteDebt&&confirm("Delete this debt record?")){
            data.debts=data.debts.filter(d=>d.id!==b.dataset.deleteDebt);
            save();
            refresh();
        }

        if(b.dataset.disconnect&&confirm("Remove this demo account?")){
            data.accounts=data.accounts.filter(a=>a.id!==b.dataset.disconnect);
            save();
            renderSettings();
        }
    });

    byId("export-data")?.addEventListener("click",()=>{
        const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
        downloadBlob(blob,"wealthness-backup.json")
    });

    byId("import-json")?.addEventListener("change",async e=>{
        const file=e.target.files[0];
        if(!file)return;

        try{
            if(file.size>1024*1024)throw Error("size");
            const imported=JSON.parse(await file.text());
            const requiredArrays=["transactions","goals","debts","accounts","recurring","plannedPayments","customCategories"];
            if(!imported||typeof imported!=="object"||requiredArrays.some(key=>!Array.isArray(imported[key]))||
               imported.transactions.some(t=>!t||!["income","expense"].includes(t.type)||!Number.isFinite(Number(t.amount))||Number(t.amount)<=0||typeof t.description!=="string"))throw Error("invalid");

            if(confirm("Replace your current Wealthness data with this backup? Only restore a file you trust.")){
                data={...defaultData(),...imported};
                data.settings={...defaultData().settings,...(imported.settings||{})};
                data.planner={...defaultData().planner,...(imported.planner||{})};
                save();
                refresh();
                toast("Backup restored.")
            }
        }catch(err){
            toast("That backup file is not valid.")
        }

        e.target.value=""
    });

    const toggle=byId("menu-toggle"),sidebar=byId("sidebar"),overlay=byId("mobile-overlay");

    toggle?.addEventListener("click",()=>{
        sidebar.classList.toggle("open");
        overlay.classList.toggle("show")
    });

    overlay?.addEventListener("click",()=>{
        sidebar.classList.remove("open");
        overlay.classList.remove("show")
    });

    refresh();
}

// Creates a downloadable file for reports and backups.
// This function creates a file download for a report or backup. 
function downloadBlob(blob,name){
    const a=document.createElement("a"),url=URL.createObjectURL(blob);
    a.href=url;
    a.download=name;
    a.click();
    URL.revokeObjectURL(url)
}

document.addEventListener("DOMContentLoaded",initPage);
