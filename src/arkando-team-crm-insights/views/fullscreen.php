<?php
if(!defined('ABSPATH'))exit;
if (!headers_sent()) {nocache_headers();header('X-Robots-Tag: noindex, nofollow',true);}
?><!doctype html><html <?php language_attributes(); ?> dir="rtl"><head><meta charset="<?php bloginfo('charset');?>"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>مرکز فرماندهی CRM | آرکاندو</title><?php wp_head(); ?></head><body class="ark-crm-standalone" dir="rtl"><?php echo do_shortcode('[arkando_team_crm]'); ?><?php wp_footer(); ?></body></html>
