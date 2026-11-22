/* Earwise support page contact form (Web3Forms). */
(function () {
  var form = document.getElementById("support-form");
  var status = document.getElementById("form-status");
  if (!form) return;

  var button = form.querySelector('button[type="submit"]');

  function showStatus(kind, text) {
    if (!status) return;
    status.hidden = false;
    status.className = "form-status" + (kind ? " is-" + kind : "");
    status.textContent = text;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(form);
    var topic = (data.get("topic") || "").toString().trim();
    if (topic) data.set("subject", "Earwise website message — " + topic);

    showStatus("", "Sending…");
    if (button) button.disabled = true;

    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      body: data,
      headers: { Accept: "application/json" }
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (json) {
          return { ok: response.ok, json: json };
        });
      })
      .then(function (result) {
        if (result.json && result.json.success) {
          form.reset();
          showStatus("success", "Thanks, we'll reply to your email soon.");
        } else {
          throw new Error((result.json && result.json.message) || "Request failed");
        }
      })
      .catch(function () {
        showStatus("error", "Something went wrong. Please email hello@getearwise.com");
      })
      .then(function () {
        if (button) button.disabled = false;
      });
  });
})();
