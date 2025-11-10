        function navigate(route) {
          window.location.href = route; // Redirects to the given route
        }


  //fetch api fetching the data from the respone url
  async function fetchLatestData() {
  const response = await fetch("/api/latest-bin-data");
  const data = await response.json();
  

  const tbody = document.getElementById("historyTableBody");
  tbody.innerHTML = ""; // clear old rows

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.time}</td><td>${row.fillLevel}%</td>`;
    tbody.appendChild(tr);
  });

  if (data.length > 0) {
    const latest = data[0]; // first row = latest

    const BinUpperText = document.getElementById("binLevel");
    const bar = document.getElementById("binProgress");
    const text = document.getElementById("binProgressText");

    bar.style.width = latest.fillLevel + "%";
    bar.setAttribute("aria-valuenow", latest.fillLevel);
    text.textContent = latest.fillLevel + "%";
    BinUpperText.textContent = latest.fillLevel + "%";


    const statusMessage = document.getElementById("statusMessage");

    // // Change color depending on level
      if (latest.fillLevel < 75) {
        bar.className = "progress-bar bg-success";
        statusMessage.innerText = "Bin Available ✅";
        statusMessage.className = "fw-bold text-success";
      } else if ( 75 < latest.fillLevel < 90) {
        bar.className = "progress-bar bg-warning";
        statusMessage.innerText = "Bin Almost Full ⚠️";
       statusMessage.className = "fw-bold text-warning";
      } else {
        bar.className = "progress-bar bg-danger";
        statusMessage.innerText = "Bin Full ❌";
        statusMessage.className = "fw-bold text-danger";
      }
  }

} 


fetchLatestData();
setInterval(fetchLatestData, 1000); 

