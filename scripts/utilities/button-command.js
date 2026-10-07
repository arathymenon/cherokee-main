/**
 * This is a custom implementation of the button "command" and "commandfor" attributes
 * in order to open a "dialog" element in the "modal" mode.
 *
 * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button#command
 *
 * This JavaScript code should be removed when the browser support for the attributes is good enough
 * or when the "popovertarget" and "popovertargetaction" are capable of handling the same functionality.
 *
 * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button#popovertarget
 */

document.addEventListener("click", (event) => {
  const $command = event.target.closest(
    "[data-vegax-command], [data-vegax-commandfor]"
  );
  if (!$command) return;

  const command = $command.getAttribute("data-vegax-command");
  const commandFor = $command.getAttribute("data-vegax-commandfor");
  const $target = document.getElementById(commandFor);

  switch (command) {
    case "show-modal":
      $target.showModal();
      break;
    case "close":
      $target.close();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  event.preventDefault();
});
