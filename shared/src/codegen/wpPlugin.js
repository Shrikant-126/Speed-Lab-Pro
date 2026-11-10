// WordPress optimisation plugin generator. Each feature is an independent, conservative PHP
// block; only the selected features are included in the generated plugin.

const php = (s) => `'${String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const phpArray = (list) => `array( ${list.map(php).join(', ')} )`;
const clean = (list) => [...new Set((list || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);

export const WP_FEATURES = [
  { key: 'lazy_images', group: 'Images & media', label: 'Lazy-load images & iframes', desc: 'Adds loading="lazy" + decoding="async" to content images/iframes, skipping the first N images (above the fold).', default: true },
  { key: 'lcp_priority', group: 'Images & media', label: 'Prioritise & preload the LCP (hero) image', desc: 'Preloads the hero image URL and adds fetchpriority="high" to it.', needs: 'lcpUrl' },
  { key: 'defer_js', group: 'JavaScript', label: 'Defer JavaScript (WordPress 6.3+ loading strategy)', desc: 'Marks enqueued front-end scripts as defer (WordPress keeps dependency order safe). Excluded handles stay as they are.', default: true },
  { key: 'delay_js', group: 'JavaScript', label: 'Delay third-party scripts until user interaction', desc: 'GTM, GA, Meta Pixel, Clarity, Hotjar, chat… run on first scroll/tap/click (or after a timeout). Edit the patterns below.' },
  { key: 'remove_jquery_migrate', group: 'JavaScript', label: 'Remove jQuery Migrate', desc: 'Drops jquery-migrate on the front end (test old plugins first).' },
  { key: 'disable_emojis', group: 'JavaScript', label: 'Disable WordPress emoji scripts', desc: 'Removes wp-emoji-release.min.js and its inline styles.', default: true },
  { key: 'disable_embeds', group: 'JavaScript', label: 'Disable oEmbed (wp-embed.js)', desc: 'Removes wp-embed script and oEmbed discovery links.', default: true },
  { key: 'woo_cart_fragments', group: 'JavaScript', label: 'WooCommerce: disable cart fragments outside the shop', desc: 'Removes the wc-cart-fragments AJAX call on non-shop pages.' },
  { key: 'heartbeat', group: 'JavaScript', label: 'Limit the Heartbeat API', desc: 'Disables Heartbeat on the front end and slows it to 60 s in the admin.' },
  { key: 'minify_html', group: 'HTML & CSS', label: 'Minify HTML output', desc: 'Removes HTML comments and collapses whitespace (keeps <pre>, <textarea>, <script>, <style> untouched).' },
  { key: 'async_css', group: 'HTML & CSS', label: 'Load selected stylesheets asynchronously', desc: 'Non-critical style handles load with media="print" onload swap.', needs: 'asyncCss' },
  { key: 'google_fonts_swap', group: 'HTML & CSS', label: 'Google Fonts: add display=swap', desc: 'Text stays visible while Google Fonts load.', default: true },
  { key: 'disable_dashicons', group: 'HTML & CSS', label: 'Remove Dashicons for visitors', desc: 'Dashicons CSS loads only for logged-in users.', default: true },
  { key: 'preload_fonts', group: 'Resource hints', label: 'Preload critical fonts', desc: 'Adds <link rel="preload" as="font" crossorigin> for the font URLs below.', needs: 'preloadFonts' },
  { key: 'resource_hints', group: 'Resource hints', label: 'Preconnect to critical origins', desc: 'Adds preconnect hints (e.g. fonts.gstatic.com, your image CDN).', needs: 'preconnect' },
  { key: 'remove_query_strings', group: 'Caching & cleanup', label: 'Remove ?ver= from static files', desc: 'Helps some CDNs/proxies cache CSS/JS (keep it off if you rely on ver for cache-busting).' },
  { key: 'clean_head', group: 'Caching & cleanup', label: 'Clean up <head>', desc: 'Removes RSD, WLW manifest, generator and shortlink tags.', default: true },
  { key: 'disable_xmlrpc', group: 'Caching & cleanup', label: 'Disable XML-RPC', desc: 'Blocks xmlrpc.php (security + fewer bot requests). Keep it on if you use the Jetpack/mobile app.' },
];

export const WP_DEFAULT_SETTINGS = {
  pluginName: 'SpeedLab Optimizer',
  lazySkip: 2,
  lcpUrl: '',
  deferExclude: ['jquery', 'jquery-core', 'jquery-migrate'],
  delayPatterns: ['googletagmanager.com', 'google-analytics.com', 'connect.facebook.net', 'fbq(', 'clarity.ms', 'hotjar.com', 'embed.tawk.to'],
  delayTimeout: 5000,
  asyncCss: [],
  preloadFonts: [],
  preconnect: ['https://fonts.gstatic.com'],
};

function block(key, s) {
  switch (key) {
    case 'lazy_images':
      return `// ---- Lazy-load images & iframes ------------------------------------------
add_filter( 'wp_lazy_loading_enabled', '__return_true' );
add_filter( 'wp_omit_loading_attr_threshold', function () {
	return ${Math.max(0, Number(s.lazySkip) || 0)};
} );
add_filter( 'the_content', 'speedlab_lazy_content', 99 );
function speedlab_lazy_content( $html ) {
	if ( is_admin() || is_feed() || '' === $html ) {
		return $html;
	}
	$count = 0;
	return preg_replace_callback(
		'/<(img|iframe)\\b[^>]*>/i',
		function ( $m ) use ( &$count ) {
			$tag  = $m[0];
			$name = strtolower( $m[1] );
			if ( 'img' === $name ) {
				$count++;
				if ( $count <= ${Math.max(0, Number(s.lazySkip) || 0)} ) {
					return $tag; // likely above the fold – keep eager
				}
			}
			if ( false !== stripos( $tag, ' loading=' ) || false !== stripos( $tag, 'fetchpriority' ) ) {
				return $tag;
			}
			$tag = preg_replace( '/^<(img|iframe)/i', '<$1 loading="lazy"', $tag );
			if ( 'img' === $name && false === stripos( $tag, ' decoding=' ) ) {
				$tag = preg_replace( '/^<img/i', '<img decoding="async"', $tag );
			}
			return $tag;
		},
		$html
	);
}`;
    case 'lcp_priority':
      return `// ---- Prioritise & preload the LCP image ------------------------------------
define( 'SPEEDLAB_LCP_URL', ${php(s.lcpUrl)} );
add_action( 'wp_head', function () {
	if ( SPEEDLAB_LCP_URL && ( is_front_page() || is_home() ) ) {
		echo '<link rel="preload" as="image" href="' . esc_url( SPEEDLAB_LCP_URL ) . '" fetchpriority="high">' . "\\n";
	}
}, 1 );
add_filter( 'wp_get_attachment_image_attributes', function ( $attr ) {
	$file = basename( (string) wp_parse_url( SPEEDLAB_LCP_URL, PHP_URL_PATH ) );
	if ( $file && isset( $attr['src'] ) && false !== strpos( $attr['src'], pathinfo( $file, PATHINFO_FILENAME ) ) ) {
		$attr['fetchpriority'] = 'high';
		$attr['loading']       = 'eager';
	}
	return $attr;
}, 20 );`;
    case 'defer_js':
      return `// ---- Defer JavaScript (WordPress 6.3+ script loading strategies) ---------------
define( 'SPEEDLAB_DEFER_EXCLUDE', ${phpArray(clean(s.deferExclude))} );
add_action( 'wp_enqueue_scripts', function () {
	if ( ! function_exists( 'wp_script_add_data' ) || is_admin() ) {
		return;
	}
	global $wp_version;
	if ( version_compare( $wp_version, '6.3', '<' ) ) {
		return;
	}
	foreach ( wp_scripts()->queue as $handle ) {
		if ( in_array( $handle, SPEEDLAB_DEFER_EXCLUDE, true ) ) {
			continue;
		}
		if ( ! wp_scripts()->get_data( $handle, 'strategy' ) ) {
			wp_script_add_data( $handle, 'strategy', 'defer' );
		}
	}
}, 9999 );`;
    case 'delay_js':
      return `// ---- Delay third-party scripts until interaction --------------------------------
define( 'SPEEDLAB_DELAY_PATTERNS', ${phpArray(clean(s.delayPatterns))} );
add_action( 'template_redirect', function () {
	if ( is_admin() || wp_doing_ajax() || is_feed() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || is_customize_preview() ) {
		return;
	}
	ob_start( 'speedlab_delay_buffer' );
}, 1 );
function speedlab_delay_buffer( $html ) {
	if ( false === stripos( $html, '<html' ) ) {
		return $html;
	}
	$html = preg_replace_callback(
		'#<script\\b([^>]*)>(.*?)</script>#is',
		function ( $m ) {
			$attrs = $m[1];
			$code  = $m[2];
			if ( preg_match( '#type\\s*=\\s*["\\']?(application/ld\\+json|text/template|speedlab/delay)#i', $attrs ) ) {
				return $m[0];
			}
			$haystack = $attrs . ' ' . $code;
			foreach ( SPEEDLAB_DELAY_PATTERNS as $pattern ) {
				if ( '' !== $pattern && false !== stripos( $haystack, $pattern ) ) {
					$attrs = preg_replace( '#\\stype\\s*=\\s*["\\'][^"\\']*["\\']#i', '', $attrs );
					$attrs = preg_replace( '#\\ssrc\\s*=#i', ' data-speedlab-src=', $attrs );
					return '<script type="speedlab/delay"' . $attrs . '>' . $code . '</script>';
				}
			}
			return $m[0];
		},
		$html
	);
	$loader = '<script>(function(){var ev=["pointerdown","keydown","touchstart","scroll","mousemove","wheel"],done=false;'
		. 'function run(){if(done)return;done=true;ev.forEach(function(e){removeEventListener(e,run,{passive:true})});'
		. 'var list=[].slice.call(document.querySelectorAll(\\'script[type="speedlab/delay"]\\'));(function next(){var old=list.shift();if(!old)return;'
		. 'var s=document.createElement("script");[].slice.call(old.attributes).forEach(function(a){if(a.name!=="type"&&a.name!=="data-speedlab-src")s.setAttribute(a.name,a.value)});'
		. 'var src=old.getAttribute("data-speedlab-src");if(src){s.src=src;s.async=false;s.onload=s.onerror=next;old.replaceWith(s);}else{s.text=old.textContent;old.replaceWith(s);next();}})();}'
		. 'ev.forEach(function(e){addEventListener(e,run,{passive:true,once:true})});addEventListener("load",function(){setTimeout(run,${Math.max(0, Number(s.delayTimeout) || 0)})});})();</script>';
	return str_ireplace( '</body>', $loader . '</body>', $html );
}`;
    case 'remove_jquery_migrate':
      return `// ---- Remove jQuery Migrate --------------------------------------------------------
add_action( 'wp_default_scripts', function ( $scripts ) {
	if ( ! is_admin() && isset( $scripts->registered['jquery'] ) && $scripts->registered['jquery']->deps ) {
		$scripts->registered['jquery']->deps = array_diff( $scripts->registered['jquery']->deps, array( 'jquery-migrate' ) );
	}
} );`;
    case 'disable_emojis':
      return `// ---- Disable emojis ---------------------------------------------------------------
add_action( 'init', function () {
	remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
	remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
	remove_action( 'admin_print_styles', 'print_emoji_styles' );
	remove_filter( 'the_content_feed', 'wp_staticize_emoji' );
	remove_filter( 'comment_text_rss', 'wp_staticize_emoji' );
	remove_filter( 'wp_mail', 'wp_staticize_emoji_for_email' );
	add_filter( 'emoji_svg_url', '__return_false' );
	add_filter( 'tiny_mce_plugins', function ( $plugins ) {
		return is_array( $plugins ) ? array_diff( $plugins, array( 'wpemoji' ) ) : array();
	} );
} );`;
    case 'disable_embeds':
      return `// ---- Disable oEmbed ---------------------------------------------------------------
add_action( 'init', function () {
	remove_action( 'wp_head', 'wp_oembed_add_discovery_links' );
	remove_action( 'wp_head', 'wp_oembed_add_host_js' );
	add_filter( 'embed_oembed_discover', '__return_false' );
}, 9999 );
add_action( 'wp_footer', function () {
	wp_dequeue_script( 'wp-embed' );
} );`;
    case 'woo_cart_fragments':
      return `// ---- WooCommerce: cart fragments only where needed ----------------------------------
add_action( 'wp_enqueue_scripts', function () {
	if ( function_exists( 'is_woocommerce' ) && ! is_woocommerce() && ! is_cart() && ! is_checkout() ) {
		wp_dequeue_script( 'wc-cart-fragments' );
	}
}, 99 );`;
    case 'heartbeat':
      return `// ---- Limit the Heartbeat API --------------------------------------------------------
add_action( 'init', function () {
	if ( ! is_admin() ) {
		wp_deregister_script( 'heartbeat' );
	}
}, 1 );
add_filter( 'heartbeat_settings', function ( $settings ) {
	$settings['interval'] = 60;
	return $settings;
} );`;
    case 'minify_html':
      return `// ---- Minify HTML output ------------------------------------------------------------
add_action( 'template_redirect', function () {
	if ( is_admin() || wp_doing_ajax() || is_feed() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || is_customize_preview() ) {
		return;
	}
	ob_start( 'speedlab_minify_html' );
}, 2 );
function speedlab_minify_html( $html ) {
	if ( false === stripos( $html, '<html' ) ) {
		return $html;
	}
	$keep = array();
	$html = preg_replace_callback(
		'#<(pre|textarea|script|style)\\b[^>]*>.*?</\\1>#is',
		function ( $m ) use ( &$keep ) {
			$keep[] = $m[0];
			return '<!--SPEEDLAB' . ( count( $keep ) - 1 ) . '-->';
		},
		$html
	);
	$html = preg_replace( '#<!--(?!SPEEDLAB\\d+-->|\\[if|<!\\[endif)(.|\\s)*?-->#', '', $html );
	$html = preg_replace( '#>\\s{2,}<#', '> <', $html );
	$html = preg_replace( '#\\s{2,}#', ' ', $html );
	return preg_replace_callback(
		'#<!--SPEEDLAB(\\d+)-->#',
		function ( $m ) use ( $keep ) {
			return $keep[ (int) $m[1] ];
		},
		$html
	);
}`;
    case 'async_css':
      return `// ---- Load selected stylesheets asynchronously ------------------------------------
define( 'SPEEDLAB_ASYNC_CSS', ${phpArray(clean(s.asyncCss))} );
add_filter( 'style_loader_tag', function ( $tag, $handle ) {
	if ( is_admin() || ! in_array( $handle, SPEEDLAB_ASYNC_CSS, true ) ) {
		return $tag;
	}
	$async = preg_replace( "/media=(['\\"])[^'\\"]*\\\\1/", "media='print' onload=\\"this.media='all'\\"", $tag, 1 );
	return $async . '<noscript>' . $tag . '</noscript>';
}, 10, 2 );`;
    case 'google_fonts_swap':
      return `// ---- Google Fonts: display=swap -----------------------------------------------------
add_filter( 'style_loader_src', function ( $src ) {
	if ( false !== strpos( $src, 'fonts.googleapis.com' ) && false === strpos( $src, 'display=' ) ) {
		$src = add_query_arg( 'display', 'swap', $src );
	}
	return $src;
} );`;
    case 'disable_dashicons':
      return `// ---- Dashicons only for logged-in users ----------------------------------------------
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_user_logged_in() ) {
		wp_dequeue_style( 'dashicons' );
		wp_deregister_style( 'dashicons' );
	}
}, 99 );`;
    case 'preload_fonts':
      return `// ---- Preload critical fonts ------------------------------------------------------------
define( 'SPEEDLAB_PRELOAD_FONTS', ${phpArray(clean(s.preloadFonts))} );
add_action( 'wp_head', function () {
	foreach ( SPEEDLAB_PRELOAD_FONTS as $font ) {
		$type = preg_match( '/\\.woff2(\\?|$)/i', $font ) ? 'font/woff2' : 'font/woff';
		echo '<link rel="preload" href="' . esc_url( $font ) . '" as="font" type="' . esc_attr( $type ) . '" crossorigin>' . "\\n";
	}
}, 2 );`;
    case 'resource_hints':
      return `// ---- Preconnect to critical origins -----------------------------------------------------
define( 'SPEEDLAB_PRECONNECT', ${phpArray(clean(s.preconnect))} );
add_filter( 'wp_resource_hints', function ( $urls, $relation ) {
	if ( 'preconnect' === $relation ) {
		foreach ( SPEEDLAB_PRECONNECT as $origin ) {
			$urls[] = array(
				'href'        => $origin,
				'crossorigin' => 'anonymous',
			);
		}
	}
	return $urls;
}, 10, 2 );`;
    case 'remove_query_strings':
      return `// ---- Remove ?ver= from static files --------------------------------------------------------
function speedlab_remove_ver( $src ) {
	return ( is_admin() || false === strpos( $src, 'ver=' ) ) ? $src : remove_query_arg( 'ver', $src );
}
add_filter( 'style_loader_src', 'speedlab_remove_ver', 15 );
add_filter( 'script_loader_src', 'speedlab_remove_ver', 15 );`;
    case 'clean_head':
      return `// ---- Clean up <head> -----------------------------------------------------------------------
remove_action( 'wp_head', 'rsd_link' );
remove_action( 'wp_head', 'wlwmanifest_link' );
remove_action( 'wp_head', 'wp_generator' );
remove_action( 'wp_head', 'wp_shortlink_wp_head' );`;
    case 'disable_xmlrpc':
      return `// ---- Disable XML-RPC ------------------------------------------------------------------------
add_filter( 'xmlrpc_enabled', '__return_false' );
add_filter( 'wp_headers', function ( $headers ) {
	unset( $headers['X-Pingback'] );
	return $headers;
} );`;
    default:
      return '';
  }
}

/** Build the plugin files. Returns { slug, files: { path: content }, warnings }. */
export function buildWpPlugin(selected, settings = {}, context = {}) {
  const s = { ...WP_DEFAULT_SETTINGS, ...settings };
  const name = String(s.pluginName || 'SpeedLab Optimizer').replace(/[^\w .-]/g, '').trim() || 'SpeedLab Optimizer';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'speedlab-optimizer';
  const keys = WP_FEATURES.map((f) => f.key).filter((k) => selected.includes(k));
  const warnings = [];
  const cache = context.cachePlugin;
  if (cache && keys.some((k) => ['minify_html', 'defer_js', 'delay_js', 'lazy_images', 'async_css'].includes(k))) {
    warnings.push(`${cache} is active on this site. Turn OFF the same features in ${cache} (minify, defer/delay JS, lazy load, async CSS) or leave them off here – running both causes double processing and can break pages.`);
  }
  if (keys.includes('defer_js') && keys.includes('delay_js')) warnings.push('Defer + Delay together is fine, but test forms, sliders and menus that depend on delayed scripts.');
  for (const f of WP_FEATURES.filter((x) => keys.includes(x.key) && x.needs)) {
    const v = s[f.needs];
    if (!v || (Array.isArray(v) && !v.length)) warnings.push(`"${f.label}" is selected but has no values – it will do nothing until you fill them in.`);
  }

  const featureList = WP_FEATURES.filter((f) => keys.includes(f.key));
  const main = `<?php
/**
 * Plugin Name:       ${name}
 * Description:       Performance optimisations generated by SpeedLab Pro: ${featureList.map((f) => f.label).join(', ') || 'none selected'}.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            SpeedLab Pro
 * License:           GPL-2.0-or-later
 * Text Domain:       ${slug}
 *
 * Generated on ${new Date().toISOString().slice(0, 10)}${context.url ? ` for ${context.url}` : ''}.
 * Test on a staging site first. Deactivate the plugin to undo every change.
 */

defined( 'ABSPATH' ) || exit;

${keys.map((k) => block(k, s)).join('\n\n')}
`;

  const readme = `=== ${name} ===
Contributors: speedlab-pro
Requires at least: 6.3
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Performance optimisations generated by SpeedLab Pro.

== Description ==

Included features:

${featureList.map((f) => `* ${f.label} – ${f.desc}`).join('\n') || '* (none)'}

== Installation ==

1. WordPress admin → Plugins → Add New → Upload Plugin → choose ${slug}.zip → Install Now.
2. Activate the plugin.
3. Clear any page cache (hosting cache, WP Rocket, LiteSpeed, Cloudflare).
4. Test the home page, a product/post page, the cart/checkout and forms.
5. Retest the site in SpeedLab Pro and compare before/after.

To undo everything, deactivate the plugin.

== Notes ==

${warnings.map((w) => `* ${w}`).join('\n') || '* No conflicts detected.'}
`;

  return { slug, files: { [`${slug}/${slug}.php`]: main, [`${slug}/readme.txt`]: readme }, warnings, features: featureList };
}
