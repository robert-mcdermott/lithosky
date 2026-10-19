// SPDX-License-Identifier: Apache-2.0
// Playwright CLI callback against an isolated running app.
async page => {
  const check=(value,message)=>{if(!value)throw Error(message);};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.reload();
  await page.waitForFunction(()=>!document.querySelector('#render-start').disabled);
  if(await page.getByRole('button',{name:'Keep this scene',exact:true}).isVisible())await page.getByRole('button',{name:'Keep this scene',exact:true}).click();
  await page.getByRole('combobox',{name:'Start with a scene',exact:true}).selectOption('alpine');
  const sizes=[[1728,1117],[1440,900],[1024,600],[768,700],[601,700],[600,700],[390,844],[320,568]];
  for(const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    const state=await page.evaluate(()=>{
      const root=document.documentElement;
      return {width:root.scrollWidth,height:root.scrollHeight,panels:[...document.querySelectorAll('.workspace,.inspector')].map(el=>({overflow:getComputedStyle(el).overflowY,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,client:el.clientHeight,scroll:el.scrollHeight}))};
    });
    check(state.width<=width,`Horizontal overflow at ${width}: ${JSON.stringify(state)}`);
    if(width>600) {
      check(state.height<=height,`Document scrolls at ${width}: ${JSON.stringify(state)}`);
      check(state.panels.every(p=>p.overflow==='auto'&&p.top===76&&p.bottom===height),`Panel outside frame at ${width}`);
      await page.locator('.inspector').evaluate(el=>{el.scrollTop=el.scrollHeight;});
      await page.locator('.inspector').hover();await page.mouse.wheel(0,1000);
      check(await page.evaluate(()=>scrollY===0),'Inspector wheel scrolled the page');
    } else {
      check(state.height>height&&state.panels.every(p=>p.overflow==='visible'),`Mobile nested scrolling at ${width}`);
      await page.locator('#build-info').scrollIntoViewIfNeeded();
      check(await page.evaluate(()=>scrollY>0),'Mobile document does not scroll');
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('.workspace').evaluate(el=>{el.scrollTop=0;});
  await page.locator('.inspector').evaluate(el=>{el.scrollTop=0;});
  check(await page.evaluate(()=>scrollY===0),'Resize retained document scroll');
  if(await page.locator('#enable-atmosphere').isVisible())await page.locator('#enable-atmosphere').click();
  const anchored=await page.evaluate(()=>CSS.supports('appearance','base-select'));
  check(anchored,'Run anchored-menu regression in a browser supporting base-select');
  // Visible option rectangles must stay adjacent to their trigger and on screen,
  // even deep in either scroller. This catches the reported displaced popup.
  const menu=async(selector)=>{
    const control=page.locator(selector);await control.click();
    await page.waitForFunction(selector=>document.querySelector(selector).matches(':open'),selector);
    const rects=await control.evaluate(el=>({control:el.getBoundingClientRect().toJSON(),options:[...el.options].map(o=>o.getBoundingClientRect().toJSON()),width:innerWidth,height:innerHeight}));
    const top=Math.min(...rects.options.map(r=>r.top)),bottom=Math.max(...rects.options.map(r=>r.bottom));
    check(top>=0&&bottom<=rects.height,`Menu off screen: ${selector}`);
    check(Math.min(Math.abs(top-rects.control.bottom),Math.abs(bottom-rects.control.top))<=12,`Menu detached: ${selector}`);
    check(rects.options.every(r=>r.left>=0&&r.right<=rects.width&&Math.abs(r.left-rects.control.left)<=12),`Menu horizontal offset: ${selector}`);
    await page.keyboard.press('Escape');
    check(await control.evaluate(el=>!el.matches(':open')&&document.activeElement===el),`Escape/focus: ${selector}`);
  };
  await menu('#study-select');await menu('#render-size');await menu('#render-samples');await menu('#atmosphere-mode');
  await page.getByText('Graphics & compatibility',{exact:true}).click();await menu('#graphics-mode');
  const size=page.getByRole('combobox',{name:'Image size',exact:true});
  await size.selectOption('640');await size.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  check(await size.inputValue()==='960','Keyboard selection failed');
  await size.click();await page.getByRole('option',{name:'640 × 360',exact:true}).click();
  check(await size.inputValue()==='640','Pointer selection failed');
  await page.getByRole('combobox',{name:'Samples',exact:true}).selectOption('8');
  await page.getByRole('button',{name:'Render image',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#render-status').textContent.startsWith('Complete.'),{},{timeout:60000});
  check(await page.getByRole('button',{name:'Export PNG',exact:true}).isEnabled(),'Render after selection');
  await size.click();await page.screenshot({path:'output/playwright/ui-dropdown-desktop.png'});await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await menu('#render-size');await menu('#atmosphere-mode');
  await page.screenshot({path:'output/playwright/ui-mobile.png',fullPage:true});
  // Unsupported engines keep functional native controls; explicitly exercise
  // that CSS fallback without pretending this is a different browser engine.
  await page.evaluate(()=>{const sheet=document.styleSheets[0];sheet.insertRule('select,select::picker(select){appearance:auto !important}',sheet.cssRules.length);});
  await size.selectOption('960');check(await size.inputValue()==='960','Native fallback selection');
  await page.getByRole('button',{name:'Quick guide',exact:false}).click();
  check(await page.locator('#guide').isVisible(),'Guide inaccessible');await page.keyboard.press('Escape');
  check(errors.length===0,errors.join('; '));
  return {sizes,anchored,keyboard:true,pointer:true,render:true,mobile:true,nativeFallback:true,errors};
}
