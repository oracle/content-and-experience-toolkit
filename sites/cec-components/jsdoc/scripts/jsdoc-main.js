// JD 4/18/2017


$( document ).ready(function() {

/////////////////////////////////////     
//CURRENT PAGE HIGHLIGHTING

 
// add class to current page in Table of Contents AFTER TOC IS BUILT IN CODE ABOVE
var htmlpage = document.location.pathname.match(/[^\/]+$/)[0];
console.log("htmlpage = "+htmlpage);

var thisnav = $( "nav a" )
  //.css( "background", "#c8ebcc" )
  .filter( 'nav a[href="'+htmlpage+'"]' )
    //.css( "border-color", "red" );
thisnav.addClass("selected");


// old nav highlight code - had to remove * for wildcard.

//var thispage = $('nav a[href="'+htmlpage+'"]');
//console.log("thispage = "+thispage);

//thispage.parents("li:first").addClass("selected");
//thispage.addClass("selected");



/////////////////////////////////////     
//Render Sidebar

//$("#leftpanel").wrapInner('<div id="open-close" class="">');

//var leftpan = $('<div id="leftpanel"></div>');
 var tabset = $('<ul class="tabset-panel list-unstyled text-center"></ul>');
 var liTC = $('<li class="li1"></li>');
 var aTC = $('<a data-placement="right" data-toggle="tooltip" class="opener tooltip-link" href="#tab1"></a>');
 var spanTC = $('<span class="glyphicons glyphicons-menu-hamburger"></span>');
 aTC.append(spanTC);
 var toolTip = $('<div role="tooltip" class="tooltip right"></div>');
 var tArr = $('<div class="tooltip-arrow"></div>');
 toolTip.append(tArr);
 var innerTip1 = $('<div class="tooltip-inner">Table of Contents</div>');
 toolTip.append(innerTip1);
 aTC.append(toolTip);
 liTC.append(aTC);
 tabset.append(liTC);
 //leftpan.append(tabset);
 //leftpan.insertBefore("nav");
$("#leftpanel").append(tabset);

/////////////////////////////////////     
//Toggle Nav


//$('li1').toggle('nav');
$('.li1').click(function() {     
   $('nav').toggle();
});

});



/////////////////////////////////////     
// ACCESSIBILITY

 
// Makes skip to content set focus to #main.

$( document ).ready(function() {
        // bind a click event to the 'skipto' link
        $(".skipto").click(function(event){
    
            // strip the leading hash and declare
            // the content we're skipping to
            var skipTo="#"+this.href.split('#')[1];
    
            // Setting 'tabindex' to -1 takes an element out of normal 
            // tab flow but allows it to be focused via javascript
            $(skipTo).attr('tabindex', -1).on('blur focusout', function () {
    
            // when focus leaves this element, 
            // remove the tabindex attribute
            $(this).removeAttr('tabindex');
    
            }).focus(); // focus on the content container
        });
    });
	
	////////////////////// update homepage tiles if focus
	$(document).focusin(function(){
    //console.log('something on the page just gained focus');
    // want to find the focused element?
   	// console.log( 'focused element: ' );
    //console.log( document.activeElement );

	
	var focusedElement = document.activeElement;
	});




/////////////////////////////////////     
// show page after load 

$( document ).ready(function() {
console.log("body function")

$('body').css('display','block');

$('body').fadeIn(100);

    });


