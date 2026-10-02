/**
 * Personalización de apariencia por zona (Widget.skin). Concatenado en el build antes de core.js.
 * Capa encima del CSS base: sin valores no genera nada (el widget se ve como siempre).
 * La validación es la misma que src/lib/widget-skin.ts (servidor); hay test que las compara.
 */
var WIDGET_SKIN_COLOR_KEYS = [
  'headerBg', 'headerText', 'footerBg', 'inputBg', 'inputText', 'sendBg',
  'chatBg', 'userBubbleBg', 'userBubbleText', 'botBubbleBg', 'botBubbleText', 'fabBg'
];
/** Fuentes ofrecidas → pila CSS. 'inherit' = la de la web donde vive el widget. */
var WIDGET_SKIN_FONTS = {
  inherit: 'inherit',
  Inter: '"Inter",system-ui,sans-serif',
  Poppins: '"Poppins",system-ui,sans-serif',
  Roboto: '"Roboto",system-ui,sans-serif',
  Montserrat: '"Montserrat",system-ui,sans-serif',
  Lato: '"Lato",system-ui,sans-serif',
  'Open Sans': '"Open Sans",system-ui,sans-serif',
  Nunito: '"Nunito",system-ui,sans-serif',
  system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'
};
var WIDGET_SKIN_SCALES = { sm: 13, md: 14.5, lg: 16 };

function widgetSkinHex(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return /^#[0-9a-f]{6}$/.test(s) ? s : '';
}

function normalizeWidgetSkin(raw) {
  var out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (var i = 0; i < WIDGET_SKIN_COLOR_KEYS.length; i++) {
    var k = WIDGET_SKIN_COLOR_KEYS[i];
    var hex = widgetSkinHex(raw[k]);
    if (hex) out[k] = hex;
  }
  if (typeof raw.fontFamily === 'string' && Object.prototype.hasOwnProperty.call(WIDGET_SKIN_FONTS, raw.fontFamily)) {
    out.fontFamily = raw.fontFamily;
  }
  if (raw.fontScale === 'sm' || raw.fontScale === 'md' || raw.fontScale === 'lg') out.fontScale = raw.fontScale;
  return out;
}

/** URL de Google Fonts para la fuente elegida ('' si no hace falta cargar nada). */
function widgetSkinFontUrl(skin) {
  var f = skin && skin.fontFamily;
  if (!f || f === 'inherit' || f === 'system') return '';
  return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700&display=swap';
}

function buildWidgetSkinCss(rootId, rawSkin) {
  var s = normalizeWidgetSkin(rawSkin);
  var r = '#' + rootId;
  var css = '';
  if (s.headerBg) {
    css += r + ' .afhub-header{background:' + s.headerBg + ' !important;}' +
      r + ' .afhub-chat.afhub-chat--fullscreen .afhub-header{background:' + s.headerBg + ' !important;}';
  }
  if (s.headerText) {
    css += r + ' .afhub-header,' + r + ' .afhub-header *{color:' + s.headerText + ' !important;}' +
      r + ' .afhub-header svg{stroke:currentColor;}';
  }
  if (s.footerBg) {
    // Zona de escribir + franja de política y "powered by": el pie entero de un color.
    css += r + ' .afhub-input-area,' + r + ' .afhub-policy,' + r + ' .afhub-powered{background:' + s.footerBg + ' !important;}';
  }
  if (s.inputBg) css += r + ' .afhub-input-composer{background:' + s.inputBg + ' !important;}';
  if (s.inputText) css += r + ' .afhub-input{color:' + s.inputText + ' !important;}';
  if (s.sendBg) css += r + ' .afhub-send{background:' + s.sendBg + ' !important;}';
  if (s.chatBg) css += r + ' .afhub-messages{background:' + s.chatBg + ' !important;background-image:none !important;}';
  if (s.userBubbleBg || s.userBubbleText) {
    css += r + ' .afhub-msg.user{' + (s.userBubbleBg ? 'background:' + s.userBubbleBg + ' !important;' : '') +
      (s.userBubbleText ? 'color:' + s.userBubbleText + ' !important;' : '') + '}';
  }
  if (s.botBubbleBg || s.botBubbleText) {
    css += r + ' .afhub-msg.bot{' + (s.botBubbleBg ? 'background:' + s.botBubbleBg + ' !important;' : '') +
      (s.botBubbleText ? 'color:' + s.botBubbleText + ' !important;' : '') + '}';
  }
  if (s.fabBg) css += r + ' .afhub-fab{background:' + s.fabBg + ' !important;}';
  if (s.fontFamily) {
    css += r + ',' + r + ' *,' + r + ' *::before,' + r + ' *::after{font-family:' + WIDGET_SKIN_FONTS[s.fontFamily] + ' !important;}';
  }
  if (s.fontScale) {
    var px = WIDGET_SKIN_SCALES[s.fontScale];
    css += r + ' .afhub-messages{font-size:' + px + 'px !important;}' + r + ' .afhub-input{font-size:' + px + 'px !important;}';
  }
  return css;
}
