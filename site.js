const toggle=document.querySelector('[data-nav-toggle]');
const mobile=document.querySelector('[data-mobile-nav]');
if(toggle&&mobile){
  const close=()=>{mobile.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open menu')};
  toggle.addEventListener('click',()=>{const open=!mobile.classList.contains('open');mobile.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close menu':'Open menu')});
  mobile.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();toggle.focus()}});
}

const tabs=[...document.querySelectorAll('[role="tab"]')];
if(tabs.length){
  const activate=tab=>{
    tabs.forEach(item=>{
      const selected=item===tab;
      item.setAttribute('aria-selected',String(selected));
      item.tabIndex=selected?0:-1;
      const panel=document.getElementById(item.getAttribute('aria-controls'));
      if(panel)panel.hidden=!selected;
    });
  };
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>activate(tab));
    tab.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      else return;
      event.preventDefault();activate(tabs[next]);tabs[next].focus();
    });
  });
}

/* Sitewide website credit */
(()=>{
  const credit='Website by <a href="mailto:me@caseykeown.com">Twin Lakes Web Co. LLC</a>';
  const existing=document.querySelector('.footer-credit-line, .footer-credit-global, .standalone-credit, footer.credit');
  if(existing){
    existing.innerHTML=credit;
    return;
  }

  const footerInner=document.querySelector('.site-footer .footer-inner');
  if(footerInner){
    const block=document.createElement('div');
    block.className='footer-bottom footer-credit-global';
    block.innerHTML=credit;
    footerInner.appendChild(block);
    return;
  }

  const footer=document.createElement('footer');
  footer.className='standalone-credit';
  footer.innerHTML=credit;
  footer.style.textAlign='center';
  footer.style.padding='24px';
  footer.style.font='500 13px system-ui, sans-serif';
  footer.style.color='#4a5c6e';
  const linkStyle=()=>{
    const link=footer.querySelector('a');
    if(link){link.style.color='inherit';link.style.fontWeight='600'}
  };

  if(document.title.startsWith('Page Not Found')){
    footer.style.position='fixed';
    footer.style.left='0';
    footer.style.right='0';
    footer.style.bottom='8px';
    footer.style.padding='8px 16px';
    footer.style.fontSize='12px';
    footer.style.color='rgba(255,255,255,.72)';
  }

  document.body.appendChild(footer);
  linkStyle();
})();
