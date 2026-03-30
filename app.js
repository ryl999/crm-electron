// ================= 全局变量 =================
let reminderRules = {};  // 跟进提醒天数
let statusList = [];     // 跟进状态列表
let customers = [];      // 客户列表
let todoList = [];       // 新增：待办事项列表
let currentIndex = null; // 当前查看联系记录索引
let editingIndex = null; // 当前编辑客户索引

// ================= 页面加载 =================
window.onload = async () => {
  const data = await window.electronAPI.loadData();

  statusList = data.statusList.length ? data.statusList : [
    { name: "未跟进", color: "#e74c3c" },
    { name: "跟进中", color: "#f1c40f" },
    { name: "已完成", color: "#2ecc71" }
  ];

  customers = data.customers || [];
  reminderRules = data.reminderRules || {};
  todoList = data.todoList || [];

  rebuildTodos();
  checkReminderTodos();
  renderStatusBar();
  renderTable();

  // ⭐ 加在这里
  refreshCompanyButtons();
  refreshContactButtons();
};
// ================= 数据保存 =================
function saveAllData() {
  window.electronAPI.saveData({ customers, statusList, reminderRules ,todoList}); // 保存到本地
}

// ================= 状态提示栏 =================
function renderStatusBar() {
  const box = document.getElementById("statusList");
  box.innerHTML = "";
  statusList.forEach(s => {
    box.innerHTML += `
      <div class="status-item">
        <div class="status-dot" style="background:${s.color}"></div>${s.name}
      </div>`; // 状态颜色提示
  });
}

// ================= 自动列宽+自适应窗口 =================
function syncColumnWidthsFull() {

  // 获取外层容器（决定表格最大可用宽度）
  const container = document.querySelector(".table-container");

  // 获取表格
  const table = document.querySelector(".customer-table");

  // 如果没有找到元素，直接退出（防止报错）
  if (!table || !container) return;

  // 容器当前宽度（关键：所有列宽计算的基础）
  const containerWidth = container.clientWidth;

  // 获取表头和表体
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  // 如果缺少结构，退出
  if (!thead || !tbody) return;

  // 所有表头单元格 th
  const ths = Array.from(thead.querySelectorAll("th"));

  // 所有行 tr
  const trs = Array.from(tbody.querySelectorAll("tr"));

  // 👉 地址列索引（第6列，从0开始）
  const addressColIndex = 5;

  // 👉 最后一列（操作列）
  const lastColIndex = ths.length - 1;

  // ================= ① 计算每一列“最小需要宽度” =================
  const colWidths = ths.map((th, i) => {

    // 地址列先不计算（后面单独处理）
    if (i === addressColIndex) return 0;

    // 初始值 = 表头宽度
    let max = th.scrollWidth;

    // 遍历每一行，取该列最大宽度
    trs.forEach(tr => {
      const td = tr.children[i];
      if (td) {
        // scrollWidth = 不换行情况下真实宽度
        max = Math.max(max, td.scrollWidth);
      }
    });

    // 如果是最后一列（操作列），保证最小80px
    if (i === lastColIndex) {
      max = Math.max(max, 80);
    }

    // 返回该列计算后的最小宽度
    return max;
  });

  // ================= ② 计算地址列宽度（吃剩余空间） =================

  // 所有已计算列宽总和（不含地址列）
  const usedWidth = colWidths.reduce((sum, w) => sum + w, 0);

  // 地址列 = 剩余空间（至少50px）
  colWidths[addressColIndex] = Math.max(containerWidth - usedWidth, 50);

  // ================= ③ 计算缩放比例 =================

  // 最小窗口宽度 = 当前窗口的80%
  const screenMinWidth = window.innerWidth * 0.8;

  // 默认缩放比例 = 当前容器 / 实际总宽
  let scale = containerWidth / (usedWidth + colWidths[addressColIndex]);

  // 如果窗口太小 → 强制使用最小缩放比例
  if (containerWidth < screenMinWidth) {
    scale = screenMinWidth / (usedWidth + colWidths[addressColIndex]);
  }

  // ================= ④ 应用宽度到表头 =================
  ths.forEach((th, i) => {
    th.style.width = colWidths[i] * scale + "px";
  });

  // ================= ⑤ 应用宽度到每一行 =================
  trs.forEach(tr => {
    Array.from(tr.children).forEach((td, i) => {

      // 设置每个单元格宽度
      td.style.width = colWidths[i] * scale + "px";

      // 操作列最小宽度限制
      td.style.minWidth = i === lastColIndex ? "80px" : "0";

      // 地址列隐藏溢出
      td.style.overflow = i === addressColIndex ? "hidden" : "visible";

      // 地址列显示省略号，其它列直接裁切
      td.style.textOverflow = i === addressColIndex ? "ellipsis" : "clip";
    });
  });

  // ================= ⑥ 字体 & 行高适配 =================

  // 基础字体大小
  const baseFont = 10;

  // 基础行高（提高可读性）
  const baseLine = 1.5;

  // 设置缩放原点（左上角）
  table.style.transformOrigin = "left top";

  // 设置字体大小（不随 scale）
  table.style.fontSize = baseFont + "px";

  // 行高随 scale 缩放（避免挤在一起）
  table.style.lineHeight = (baseLine * scale) + "em";
}

// ================= 渲染表格 =================
function renderTable() {
  customers.forEach(c => {
  if (!Array.isArray(c.company)) c.company = [c.company || ""];
  if (!Array.isArray(c.contacts)) {
    c.contacts = [{
      name: c.contact || "",
      phone: c.phone || ""
    }];
  }
});
  const tbody = document.getElementById("customerBody"); // 获取表体元素
  tbody.innerHTML = ""; // 清空表体内容

  customers.forEach((c, idx) => {
    // 1️⃣ 获取当前客户状态对应的颜色，如果没有找到状态颜色，默认用灰色
    const color = (statusList.find(s => s.name === c.status) || {}).color || "#ccc";

    // 2️⃣ 创建一行 <tr>
    const tr = document.createElement("tr");

    // 3️⃣ 判断客户是否达到跟进提醒条件，若是则整行高亮
    if (checkReminder(c)) { 
      tr.style.backgroundColor = "#fff0f0"; // 高亮颜色，可自定义
    }

    // 4️⃣ 填充行内容，操作列显示状态颜色
    tr.innerHTML = `
      <td>
        <select class="table-select">
          ${(c.company || []).map(name => `<option>${name}</option>`).join("")}
        </select>
      </td>
      <td>
        <select class="table-select">
          ${(c.contacts || []).map(p => `<option>${p.name}${p.phone ? "-" + p.phone : ""}</option>`).join("")}
        </select>
      </td>
      <td>${c.source || ""}</td>          <!-- 来源 -->
      <td>${c.product || ""}</td>         <!-- 产品信息 -->
      <td>${c.region || ""}</td>          <!-- 地区 -->
      <td>${c.address || ""}</td>         <!-- 地址 -->
      <td>${c.updated}</td>               <!-- 最新跟进日期 -->
      <td style="background-color:${color};">  <!-- 操作列背景显示状态颜色 -->
        <button onclick="openRecordModal(${idx})">联系记录</button> <!-- 联系记录按钮 -->
        <button onclick="editCustomer(${idx})">编辑</button>         <!-- 编辑客户按钮 -->
      </td>`; // 表格操作列

    // 5️⃣ 将这一行添加到表体
    tbody.appendChild(tr);
  });

  // 6️⃣ 调用列宽自适应函数，保证表头和表体列宽一致
  syncColumnWidthsFull(); 
}

// 窗口缩放自动调整列宽
window.addEventListener("resize", syncColumnWidthsFull);

// ================= 客户弹窗 =================
function openCustomerModal() {
  editingIndex = null;
  document.getElementById("modalTitle").innerText = "新增客户";
  document.getElementById("customerModal").style.display = "block";

  fillStatusSelect();
  removeDeleteButton();
  clearForm();

  // ⭐ 初始化一行公司
  const companyBox = document.getElementById("companyContainer");
  companyBox.innerHTML = "";
  addCompanyInput();

  // ⭐ 初始化一行联系人
  const contactBox = document.getElementById("contactContainer");
  contactBox.innerHTML = "";
  addContactRow();

  refreshCompanyButtons();
  refreshContactButtons();
}

function closeCustomerModal() { 
  document.getElementById("customerModal").style.display = "none"; // 隐藏弹窗
}

// 编辑客户弹窗
function editCustomer(idx) {
  editingIndex = idx;
  const c = customers[idx];

  document.getElementById("modalTitle").innerText = "编辑客户";
  document.getElementById("customerModal").style.display = "block";

  // ===== 公司 =====
  const companyBox = document.getElementById("companyContainer");
  companyBox.innerHTML = "";
  (c.company || []).forEach(name => {
    addCompanyInput(name);
  });

  // ===== 联系人 =====
  const contactBox = document.getElementById("contactContainer");
  contactBox.innerHTML = "";
  (c.contacts || []).forEach(p => {
    addContactRow(p.name, p.phone);
  });

  // ⭐ 刷新按钮（必须在最后）
  refreshCompanyButtons();
  refreshContactButtons();

  // ===== 其它字段 =====
  document.getElementById("c_source").value = c.source || "";
  document.getElementById("c_product").value = c.product || "";
  document.getElementById("c_region").value = c.region || "";
  document.getElementById("c_address").value = c.address || "";

  fillStatusSelect();
  document.getElementById("c_status").value = c.status;

  addDeleteButton(idx);
}

// 保存客户
function saveCustomer() {
  const now = new Date().toISOString().split("T")[0]; // 当前日期
  const data = {
    company: getCompanyList(),   // 多公司名
    contacts: getContactList(),  // 多联系人
    source: document.getElementById("c_source").value,
    product: document.getElementById("c_product").value,
    region: document.getElementById("c_region").value,
    address: document.getElementById("c_address").value,
    updated: now,
    status: document.getElementById("c_status").value,
    records: editingIndex !== null ? customers[editingIndex].records : []
  };

  if (getContactList().length === 0) {
    alert("至少保留一个联系人");
    return;
  }

  if (editingIndex === null) customers.push(data);
  else Object.assign(customers[editingIndex], data);

  closeCustomerModal(); // 关闭弹窗
  renderTable(); // 刷新表格
  saveAllData(); // 保存数据
  
}

// 填充状态下拉
function fillStatusSelect() {
  document.getElementById("c_status").innerHTML = statusList.map(s => `<option value="${s.name}">${s.name}</option>`).join("");
}

// 清空表单
function clearForm() { 
  ["c_source","c_product","c_region","c_address"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// 公司名
// ================= 公司名 =================
function addCompanyInput(value = "") {
  const row = document.createElement("div");
  row.className = "company-row";

  // 输入框
  const input = document.createElement("input");
  input.className = "company-input";
  input.value = value;

  // 按钮容器
  const btnGroup = document.createElement("div");
  btnGroup.className = "btn-group";

  const addBtn = document.createElement("button");
  addBtn.className = "row-btn add";
  addBtn.innerText = "＋";
  addBtn.onclick = () => {
    addCompanyInput();
    refreshCompanyButtons();
  };

  const delBtn = document.createElement("button");
  delBtn.className = "row-btn del";
  delBtn.innerText = "－";
  delBtn.onclick = function () {
    deleteCompanyRow(this);
  };

  btnGroup.appendChild(addBtn);
  btnGroup.appendChild(delBtn);

  row.appendChild(input);
  row.appendChild(btnGroup);

  document.getElementById("companyContainer").appendChild(row);

  // 每次新增/删除后刷新按钮显示逻辑
  refreshCompanyButtons();
}

// 删除/添加
function deleteCompanyRow(btn) {
  const container = document.getElementById("companyContainer");

  if (container.children.length <= 1) {
    alert("至少保留一个公司名称");
    return;
  }

  if (!confirm("确定要删除这个公司名称吗？")) {
    return;
  }

  // ✅ 删整行（关键）
  const row = btn.closest(".company-row");
  row.remove();

  refreshCompanyButtons();
}

// 联系人
function addContactRow(name = "", phone = "") {
  const row = document.createElement("div");
  row.className = "contact-row";

  row.innerHTML = `
    <div class="contact-inputs">
      <input class="contact-name" value="${name}">
      <input class="contact-phone" value="${phone}">
    </div>
    <div class="btn-group">
      <button class="row-btn add">+</button>
      <button class="row-btn del">-</button>
    </div>
  `;

  row.querySelector(".add").onclick = () => {
    addContactRow();
    refreshContactButtons(); // ⭐必须加
  };

  row.querySelector(".del").onclick = function () {
    deleteContactRow(this);
  };
  row.querySelector(".del").onclick = () => deleteContactRow(row);

  document.getElementById("contactContainer").appendChild(row);
  refreshContactButtons(); // ⭐必须有
}

// 删除/添加
function deleteContactRow(btn) {
  const container = document.getElementById("contactContainer");

  if (container.children.length <= 1) {
    alert("至少保留一个联系人");
    return;
  }

  if (!confirm("确定要删除这个联系人吗？")) {
    return;
  }

  // ✅ 删整行
  const row = btn.closest(".contact-row");
  row.remove();

  refreshContactButtons();
}
// 获取公司名列表
function getCompanyList() {
  const inputs = document.querySelectorAll(".company-input");
  return Array.from(inputs).map(i => i.value.trim()).filter(v => v);
}

// 获取联系人列表
function getContactList() {
  const rows = document.querySelectorAll(".contact-row");
  return Array.from(rows).map(row => {
    return {
      name: row.querySelector(".contact-name").value.trim(),
      phone: row.querySelector(".contact-phone").value.trim()
    };
  }).filter(c => c.name);
}

//公司按钮
function refreshCompanyButtons() {
  const rows = document.querySelectorAll("#companyContainer .company-row");

  rows.forEach((row, index) => {
    const addBtn = row.querySelector(".add");
    const delBtn = row.querySelector(".del");

    if (!addBtn || !delBtn) return;

    // ⭐ 只有最后一行显示加号
    addBtn.style.display = index === rows.length - 1 ? "inline-block" : "none";

    // ⭐ 只有多于1行时显示减号
    delBtn.style.display = rows.length === 1 ? "none" : "inline-block";
  });
}

//联系人按钮
function refreshContactButtons() {
  const rows = document.querySelectorAll("#contactContainer .contact-row");

  rows.forEach((row, index) => {
    const addBtn = row.querySelector(".add");
    const delBtn = row.querySelector(".del");

    if (!addBtn || !delBtn) return;

    // ⭐ 只有最后一行显示 +
    addBtn.style.display =
      index === rows.length - 1 ? "inline-block" : "none";

    // ⭐ 只有一行时不能删
    delBtn.style.display =
      rows.length === 1 ? "none" : "inline-block";
  });
}

// ================ 增加 / 删除 删除客户按钮函数 ================
function addDeleteButton(idx) {
  removeDeleteButton(); // 先删除已有按钮，避免重复

  const modalContent = document.querySelector("#customerModal .modal-content"); // 弹窗内容
  const btn = document.createElement("button"); // 创建删除按钮
  btn.id = "deleteCustomerBtn"; // 按钮ID
  btn.innerText = "删除客户"; // 按钮文字
  btn.style.marginLeft = "8px"; // 与保存按钮保持间距
  btn.onclick = () => { // 点击事件
    if (confirm(`确定要删除客户 "${(customers[idx].company || []).join('/')}" 吗？`)) { // 弹出确认
      customers.splice(idx, 1); // 删除客户
      closeCustomerModal(); // 关闭弹窗
      renderTable(); // 刷新表格
      saveAllData(); // 保存数据
    }
  };

  modalContent.appendChild(btn); // 添加到弹窗内容
}

function removeDeleteButton() {
  const existing = document.getElementById("deleteCustomerBtn"); // 查找已有按钮
  if (existing) existing.remove(); // 删除
}

// ================= 联系记录 =================
function openRecordModal(idx) {// 打开联系记录窗口
  currentIndex = idx;
  document.getElementById("recordModal").style.display = "block";
document.getElementById("recordCustomerName").innerText = 
  (customers[idx].company || []).join(" / ");  renderRecords();

}

// 关闭窗口
function closeRecordModal() {
  document.getElementById("recordModal").style.display = "none";

}

// 渲染历史联系记录
function renderRecords() {
  const c = customers[currentIndex];
  document.getElementById("recordList").innerHTML =  // 联系记录列表
    c.records
      .map(r => `<div>${r.date} - ${r.content} - ${r.status}</div>`)
      .join("");

  // 跟进状态选择
  document.getElementById("recordStatusSelect").innerHTML =
    statusList
      .map(s => `<option value="${s.name}">${s.name}</option>`)
      .join("");

}

// ================= 新增联系记录 =================
function addRecord() {
  const now = new Date().toISOString().split("T")[0];
  const content = document.getElementById("newRecordContent").value.trim();
  if (!content) {
    alert("请输入联系内容");
    return;
  }

  const status = document.getElementById("recordStatusSelect").value;

  customers[currentIndex].records.push({
    date: now,
    content: content,
    status: status
  });

  rebuildTodos();

  const mainCompany = (customers[currentIndex].company || [])[0] || "";

  todoList.forEach(t => {
    if (t.company === mainCompany && t.date === now && t.content === "客户跟进提醒") {
      t.done = true;
    }
  });

  renderTodayTodos();
  updateTodoBadge();

  customers[currentIndex].status = status;
  customers[currentIndex].updated = now;

  document.getElementById("newRecordContent").value = "";

  renderRecords();
  renderTable();

  saveAllData();
}

// ================= 自动解析联系记录中的日期任务 =================
function parseTodo(content,index){
  const dateRegex=/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}/g;
  const match=content.match(dateRegex);
  if(!match) return;

  const mainCompany = (customers[index].company || [])[0] || "";

  match.forEach(d=>{
    let fullDate=d;

    if(d.length<=5){
      const year = new Date().getFullYear();
      const parts = d.split("-");
      fullDate = year + "-" + parts[0].padStart(2,"0") + "-" + parts[1].padStart(2,"0");
    }

    const exist = todoList.find(t =>
      t.company === mainCompany &&
      t.content === content &&
      t.date === fullDate
    );

    if(!exist){
      todoList.push({
        company: mainCompany,
        content: content,
        date: fullDate,
        done: false
      });
    }
  });
}

// ================= 重建待办 =================
function rebuildTodos() {
  // 1️⃣ 保存已勾选状态
  const doneMap = {};
  todoList.forEach(t => {
    doneMap[t.company + "|" + t.content + "|" + t.date] = t.done;
  });

  // 2️⃣ 清空由联系记录生成的待办
  todoList = [];

  customers.forEach((c,index)=>{
    if(!c.records) return;
    c.records.forEach(r=>{
      parseTodo(r.content,index); // 解析联系记录生成待办
    });
  });

  checkReminderTodos(); // 保留客户跟进提醒生成的待办

  // 3️⃣ 恢复勾选状态
  todoList.forEach(t=>{
    const key = t.company + "|" + t.content + "|" + t.date;
    if(doneMap[key]) t.done = true;
  });

  updateTodoBadge(); // ⭐ 更新角标
}

// ================= 检查客户跟进提醒 =================
function checkReminderTodos(){
  const today = new Date();

  customers.forEach(c=>{
    const rule = reminderRules[c.status];
    if(!rule) return;

    const last = new Date(c.updated);
    if(isNaN(last)) return;

    const diffDays = (today - last) / (1000*60*60*24);

    if(diffDays >= rule){

      const dateStr = today.toISOString().split("T")[0];
      const mainCompany = (c.company || [])[0] || "";

      const exist = todoList.find(t =>
        t.company === mainCompany &&
        t.content === "客户跟进提醒" &&
        t.date === dateStr
      );

      if(!exist){
        todoList.push({
          company: mainCompany,
          content:"客户跟进提醒",
          date: dateStr,
          done:false
        });
      }
    }
  });
}

// ================= 待办窗口 =================
// 打开待办窗口
function openTodoModal(){

  // ⭐关键：每次打开都重新计算所有待办
  rebuildTodos();

  document.getElementById("todoModal").style.display="block";

  renderTodayTodos();

}

// 关闭待办窗口
function closeTodoModal(){

  document.getElementById("todoModal").style.display="none";

}

// ================= 渲染今日待办 =================
function renderTodayTodos() {
  const box = document.getElementById("todoList");
  const today = new Date().toISOString().split("T")[0];

  // 1️⃣ 筛选今天的待办，同时保留原始 todoList 索引
  const todayTodos = todoList
    .map((t, i) => ({ ...t, originalIndex: i })) // 保存 todoList 的真实索引
    .filter(t => t.date === today);

  // 2️⃣ 如果没有今日待办
  if (todayTodos.length === 0) {
    box.innerHTML = "今天没有待办事项";
    return;
  }

  // 3️⃣ 渲染每条待办
  box.innerHTML = todayTodos.map(t => `
    <div style="padding:8px;border-bottom:1px solid #eee;cursor:pointer;
                background:${t.done ? "#f0f0f0" : "white"}; color:${t.done ? "#999" : "#000"};">
      <input type="checkbox" ${t.done ? "checked" : ""} 
             onchange="toggleTodoDone(${t.originalIndex}, this.checked)" style="margin-right:6px;">
      <span onclick="jumpToCustomer('${t.company}')">
        <b>${t.company}</b> - ${t.content}
      </span>
    </div>
  `).join("");
}

// 待办角标
function updateTodoBadge() {
  const today = new Date().toISOString().split("T")[0];
  const count = todoList.filter(t => t.date === today && !t.done).length; // 只统计未完成
  const badge = document.getElementById("todoBadge");
  if (!badge) return;

  if (count > 0) {
    badge.style.display = "inline-block";
    badge.innerText = count;
  } else {
    badge.style.display = "none";
  }
}

// 待办跳转客户
function jumpToCustomer(companyName) {
  // 找到对应客户在 customers 数组里的索引
  const idx = customers.findIndex(c => 
    (c.company || []).includes(companyName)
  );  if (idx === -1) return; // 没找到

  const tbody = document.getElementById("customerBody");
  if (!tbody) return;

  const row = tbody.children[idx];
  if (!row) return;

  // 1️⃣ 先清除其他行高亮
  tbody.querySelectorAll("tr").forEach(r => r.style.backgroundColor = "");

  // 2️⃣ 给当前行加高亮
  row.style.backgroundColor = "#ffffcc"; // 黄色背景

  // 3️⃣ 滚动到可见位置
  row.scrollIntoView({ behavior: "smooth", block: "center" });

  // 4️⃣ 关闭待办窗口
  closeTodoModal();

  // 5️⃣ 高亮自动消失，3秒后恢复原本背景色（检查是否有跟进提醒需要保留高亮）
  setTimeout(() => {
    const customer = customers[idx];
    if (checkReminder(customer)) {
      row.style.backgroundColor = "#fff0f0"; // 保留跟进提醒的高亮
    } else {
      row.style.backgroundColor = ""; // 恢复原本背景色
    }
  }, 3000);
}

function toggleTodoDone(idx, checked) {
  todoList[idx].done = checked;
  renderTodayTodos();
  updateTodoBadge(); // ⭐ 勾选同步角标
  saveAllData();
}

// ================= 状态管理 =================
function openStatusModal() { document.getElementById("statusModal").style.display="block"; renderStatusEditList(); }
function closeStatusModal() { document.getElementById("statusModal").style.display="none"; }
function renderStatusEditList() { 
  const container = document.getElementById("statusEditList"); container.innerHTML="";
  statusList.forEach((s,i)=>{ 
    const row = document.createElement("div"); row.className="status-edit-row";
    row.innerHTML=`<input value="${s.name}" onchange="updateStatusName(${i},this.value)">
      <input type="color" value="${s.color}" onchange="updateStatusColor(${i},this.value)">
      <button onclick="deleteStatus(${i})">删除</button>`;
    container.appendChild(row); 
  }); 
}
function updateStatusName(i,v) {
  const old = statusList[i].name;
  statusList[i].name = v.trim();
  customers.forEach(c=>{ if(c.status===old) c.status=v; c.records.forEach(r=>{ if(r.status===old) r.status=v; }); });
  renderStatusBar(); renderTable(); saveAllData();
}
function updateStatusColor(i,v){ statusList[i].color=v; renderStatusBar(); renderTable(); saveAllData(); }
function deleteStatus(i){
  const del=statusList[i].name; if(!confirm("确认删除："+del+" ?")) return;
  statusList.splice(i,1);
  const def=statusList[0]?.name||"";
  customers.forEach(c=>{ if(c.status===del)c.status=def; c.records.forEach(r=>{ if(r.status===del)r.status=def; }); });
  renderStatusEditList(); renderStatusBar(); renderTable(); saveAllData();
}
function addStatus(){ 
  const name=document.getElementById("newStatusName").value.trim();
  const color=document.getElementById("newStatusColor").value;
  if(!name){ alert("请输入状态名称"); return; }
  statusList.push({name,color});
  document.getElementById("newStatusName").value="";
  renderStatusEditList(); renderStatusBar(); saveAllData();
}

// ================= 搜索客户 =================
function searchCustomers(){
  const kw=document.getElementById("searchInput").value.trim().toLowerCase();
  const rows=document.querySelectorAll("#customerBody tr");
  rows.forEach(row=>{
    const text=row.innerText.toLowerCase();
    let matchText=text.includes(kw), matchPinyin=false, matchFirst=false;
    if(window.pinyinPro){
      const py=pinyinPro.pinyin(text,{toneType:"none"}).replace(/\s/g,"");
      matchPinyin=py.includes(kw);
      const first=pinyinPro.pinyin(text,{pattern:"first",toneType:"none"}).replace(/\s/g,"");
      matchFirst=first.includes(kw);
    }
    row.style.display=(matchText||matchPinyin||matchFirst)?"":"none";
  });
}

// ================= 跟进提醒 =================
function openReminderModal() {
  document.getElementById("reminderModal").style.display = "block"; // 显示跟进提醒弹窗
  const box = document.getElementById("reminderList");
  box.innerHTML = ""; // 清空现有内容

  statusList.forEach(s => {
    const days = reminderRules[s.name] || ""; // 获取当前状态的提醒天数
    box.innerHTML += `
      <div style="display:flex;align-items:center;margin-bottom:12px;padding:6px 4px;">
        <div style="width:14px;height:14px;border-radius:50%;background:${s.color};margin-right:8px;"></div> <!-- 状态颜色点 -->
        <div style="width:120px;font-size:14px;">${s.name}</div> <!-- 状态名称 -->
        <input type="number" id="rem_${s.name}" value="${days}" style="width:70px;padding:4px;text-align:center;margin-right:6px;"> <!-- 输入天数 -->
        <div style="font-size:13px;color:#666">天未跟进提醒</div> <!-- 文本说明 -->
      </div>
    `;
  });
}

function closeReminderModal() { 
  document.getElementById("reminderModal").style.display = "none"; // 隐藏弹窗
}

function saveReminder() { 
  // 1️⃣ 保存每个状态的提醒天数
  statusList.forEach(s => { 
    reminderRules[s.name] = Number(document.getElementById("rem_" + s.name).value); 
  });

  // 2️⃣ 保存到本地
  saveAllData(); 

  // 3️⃣ 立即刷新表格，重新判断每行是否高亮
  renderTable(); // ✅ 这里刷新表格高亮

  // 4️⃣ 关闭弹窗
  closeReminderModal(); 
}
// ================= 检查提醒 =================
function checkReminder(customer){
  const rule = reminderRules[customer.status];
  if(!rule) return false;

  const last = new Date(customer.updated);
  if(isNaN(last)) return false; // ⭐ 避免日期无效报错

  const now = new Date();
  return ((now - last) / (1000*60*60*24)) >= rule;
}
// ================= 智能导入 Excel（增强版，模糊匹配表头） =================
async function importExcel(input) {
  const file = input.files[0]; // 获取选择的文件
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);

    try {
      // 解析 Excel
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0]; // 默认第一个工作表
      const sheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" }); // 转为 JSON
      if (!jsonData.length) {
        alert("Excel 没有数据！");
        return;
      }

      // ===== 定义关键字映射，支持模糊匹配 =====
      const fieldKeywords = {
        company: ["公司", "企业"],           // 公司名称列关键字
        contact: ["客户", "联系人", "姓名"], // 客户名称列关键字
        phone: ["联系方式", "电话"],         // 电话列关键字
        source: ["来源"],                    // 来源
        product: ["产品"],                  // 产品信息
        region: ["地区"],                    // 地区
        address: ["地址"],                   // 地址
        status: ["状态"],                    // 跟进状态
        updated: ["跟进日期", "日期"]        // 最新跟进日期
      };

      // ===== 识别 Excel 列名对应客户对象字段 =====
      const headerKeys = Object.keys(jsonData[0]); // 表头
      const columnMap = {}; // Excel列名 → 客户字段

      headerKeys.forEach(h => {
        const hLower = h.replace(/\s/g, "").toLowerCase(); // 去空格
        for (const field in fieldKeywords) {
          const keywords = fieldKeywords[field];
          if (keywords.some(kw => hLower.includes(kw))) {
            columnMap[h] = field; // 识别该列映射到哪个字段
            break;
          }
        }
      });

      // ===== 遍历每行数据生成客户对象 =====
  jsonData.forEach(row => {
    const customer = {};

    for (const key in row) {
      if (columnMap[key]) {
        customer[columnMap[key]] = String(row[key] || "");
      }
    }

    // ✅ 转换为新结构
    customer.company = customer.company ? [customer.company] : [];

    customer.contacts = [{
      name: customer.contact || "",
      phone: customer.phone || ""
    }];

    delete customer.contact;
    delete customer.phone;

    // 默认字段
    customer.updated = customer.updated || new Date().toISOString().split("T")[0];
    customer.status = customer.status || (statusList[0]?.name || "未跟进");
    customer.records = [];

    customers.push(customer);
  });
      rebuildTodos(); // 导入后解析联系记录生成待办
      
      renderTable(); // 刷新表格
      saveAllData(); // 保存数据
      alert(`成功导入 ${jsonData.length} 条客户数据！`);

    } catch (err) {
      console.error(err);
      alert("Excel 文件解析失败，请确认文件格式正确（.xlsx/.xls）");
    }

    input.value = ""; // 清空 input
  };

  reader.readAsArrayBuffer(file); // 读取文件
}

// ================= 导出 Excel =================
function exportExcel() {
  const ws = XLSX.utils.json_to_sheet(customers.map(c => ({
    "公司名称": (c.company || []).join(" / "),
    "联系人": (c.contacts || []).map(p => p.name).join(" / "),
    "联系方式": (c.contacts || []).map(p => p.phone).join(" / "),
    "来源": c.source,
    "产品信息": c.product,
    "地区": c.region,
    "地址": c.address,
    "最新更新时间": c.updated
  })));
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "客户信息");

  XLSX.writeFile(wb, "客户信息.xlsx");
}