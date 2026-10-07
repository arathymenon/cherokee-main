const KLAVIYO_REVISION = "2023-09-15";
const BIS_ENDPOINT = "https://a.klaviyo.com/client/back-in-stock-subscriptions/";
const SUBSCRIPTIONS_ENDPOINT = "https://a.klaviyo.com/client/subscriptions/";

class BisFormKlaviyo extends HTMLElement {
  connectedCallback() {
    this.formEl = this.querySelector("form");
    if (!this.formEl) return;

    this.emailEl = this.formEl.querySelector("input[name='email']");
    this.submitEl = this.formEl.querySelector("button[type='submit']");

    this.handleEmailInput = this.handleEmailInput.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);

    if (this.emailEl) {
      this.emailEl.addEventListener("input", this.handleEmailInput);
      this.handleEmailInput();
    }
    this.formEl.addEventListener("submit", this.handleSubmit);
  }

  disconnectedCallback() {
    this.emailEl?.removeEventListener("input", this.handleEmailInput);
    this.formEl?.removeEventListener("submit", this.handleSubmit);
  }

  handleEmailInput() {
    this.removeAttribute("success");
    this.removeAttribute("error");
    if (!this.submitEl) return;
    this.submitEl.disabled = !this.emailEl.checkValidity();
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.hasAttribute("loading")) return;

    const data = new FormData(this.formEl);
    const companyId = data.get("klaviyo_company_id");
    const variantId = data.get("variant");
    const email = data.get("email");
    const listId = data.get("klaviyo_marketing_list_id");
    const acceptMarketing = data.get("accept_marketing") === "1";

    if (!companyId || !variantId || !email) {
      this.setAttribute("error", "");
      return;
    }

    this.removeAttribute("success");
    this.removeAttribute("error");
    this.setAttribute("loading", "");
    if (this.submitEl) this.submitEl.disabled = true;

    try {
      const tasks = [this.subscribeBackInStock({ companyId, variantId, email })];
      if (acceptMarketing && listId) {
        tasks.push(this.subscribeToList({ companyId, listId, email }).catch(() => null));
      }
      const [bisResponse] = await Promise.all(tasks);

      if (bisResponse && bisResponse.status === 202) {
        this.setAttribute("success", "");
      } else {
        this.setAttribute("error", "");
      }
    } catch (error) {
      this.setAttribute("error", "");
    } finally {
      this.removeAttribute("loading");
      if (this.submitEl) {
        this.submitEl.disabled = !this.emailEl.checkValidity();
      }
    }
  }

  subscribeBackInStock({ companyId, variantId, email }) {
    return fetch(`${BIS_ENDPOINT}?company_id=${encodeURIComponent(companyId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify({
        data: {
          type: "back-in-stock-subscription",
          attributes: {
            profile: {
              data: {
                type: "profile",
                attributes: { email },
              },
            },
            channels: ["EMAIL"],
          },
          relationships: {
            variant: {
              data: {
                type: "catalog-variant",
                id: `$shopify:::$default:::${variantId}`,
              },
            },
          },
        },
      }),
    });
  }

  subscribeToList({ companyId, listId, email }) {
    return fetch(`${SUBSCRIPTIONS_ENDPOINT}?company_id=${encodeURIComponent(companyId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify({
        data: {
          type: "subscription",
          attributes: {
            custom_source: "Back in stock",
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email,
                  subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                },
              },
            },
          },
          relationships: {
            list: { data: { type: "list", id: listId } },
          },
        },
      }),
    });
  }
}

customElements.define("bis-form-klaviyo", BisFormKlaviyo);
